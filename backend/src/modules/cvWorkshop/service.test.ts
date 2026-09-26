import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JobQueue, QueuedWork } from '../../jobs/queue.js';
import { LlmUnavailableError } from '../../lib/errors.js';
import type { LlmRouter, RunTaskInput } from '../../llm/router.js';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { createAnalysisResults } from './results.js';
import { type CvAnalysis, createCvWorkshopService } from './service.js';

const ANSWER: unknown = JSON.parse(readFileSync(new URL('../../../tests/fixtures/llm/diagnose_cv.json', import.meta.url), 'utf8'));
const OFFER = 'Data Analyst en CDI à Lyon. Vous maîtrisez SQL, Python, dbt et Airflow. '.repeat(4);
const NOW = new Date('2026-09-26T10:00:00Z');

/** A queue that runs each treatment at once, as run 41, and says how many analyses were already run today. */
const immediateQueue = (alreadyToday = 0) => {
  const works: QueuedWork[] = [];
  const reports: unknown[] = [];
  const queue = {
    enqueue: vi.fn(async (work: QueuedWork) => {
      works.push(work);
      await work.run((counters) => reports.push(counters), 41);
      return 41;
    }),
    countRunsSince: vi.fn(() => Promise.resolve(alreadyToday)),
  } as unknown as JobQueue;
  return { queue, works, reports };
};

/** A router whose provider answers the fixture, parsed by the schema of the task as the real router does. */
const scriptedRouter = (answer: unknown = ANSWER) => {
  const inputs: RunTaskInput<unknown>[] = [];
  const router: LlmRouter = {
    runTask: <T>(_task: string, input: RunTaskInput<T>) => {
      inputs.push(input as RunTaskInput<unknown>);
      return Promise.resolve({ data: input.schema.parse(answer), provider: 'groq_1' as const });
    },
  } as LlmRouter;
  return { router, inputs };
};

const noOcr = { readPages: vi.fn(() => Promise.reject(new Error('no OCR expected'))) };
const request = () => ({ file: buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64'), offer: OFFER });

const serviceWith = ({ queue = immediateQueue().queue, router = scriptedRouter().router } = {}) => {
  const results = createAnalysisResults<CvAnalysis>();
  const service = createCvWorkshopService({ queue, ocr: noOcr, router, results, clock: () => NOW });
  return { service, results };
};

describe('createCvWorkshopService', () => {
  it('[EF-CVX-32] queues the analysis as a manual cv_analysis of the candidate', async () => {
    const { queue, works } = immediateQueue();

    expect(await serviceWith({ queue }).service.startAnalysis(7, request())).toBe(41);
    expect(works[0]).toMatchObject({ userId: 7, job: 'cv_analysis', trigger: 'manual' });
  });

  it('[EF-CVX-24] [RG-23] keeps the diagnostic of the offer, overall score computed by the code', async () => {
    const { service } = serviceWith();

    await service.startAnalysis(7, request());

    const { diagnosis } = service.findAnalysis(7, 41);
    expect(diagnosis.overallScore).toBe(70);
    expect(diagnosis.dimensions.experience.explanation).toMatch(/Atelier Nova/);
    expect(diagnosis.weakDimensions).toEqual(['techStack']);
  });

  it('[EF-CVX-27] drops a « missing » skill the CV does cite', async () => {
    const { service } = serviceWith();

    await service.startAnalysis(7, request());

    expect(service.findAnalysis(7, 41).diagnosis.missingSkills).toEqual(['dbt', 'Airflow']);
  });

  it('[ENF-RGP-07] [ENF-SEC-06] sends the AI the CV without contact details, and the offer, both framed', async () => {
    const { router, inputs } = scriptedRouter();

    await serviceWith({ router }).service.startAnalysis(7, request());

    expect(inputs[0]?.userId).toBe(7);
    expect(inputs[0]?.prompt).toContain('<cv>');
    expect(inputs[0]?.prompt).toContain('<offer>');
    expect(inputs[0]?.prompt).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78|Camille Durand/);
  });

  it('[EF-CVX-32] publishes the reading as done before the diagnostic', async () => {
    const { queue, reports } = immediateQueue();

    await serviceWith({ queue }).service.startAnalysis(7, request());

    expect(reports).toEqual([{ cv_steps_done: 1, cv_pages_ocr: 0 }]);
  });

  it('[EF-CVX-33] refuses a sixth analysis today, without queueing it', async () => {
    const { queue } = immediateQueue(5);

    await expect(serviceWith({ queue }).service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 429,
      message: 'Vous avez fait vos 5 analyses du jour. Rendez-vous demain !',
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(queue.countRunsSince).toHaveBeenCalledWith(7, 'cv_analysis', new Date('2026-09-25T22:00:00.000Z'));
  });

  it('[EF-IA-04] ends the run in failure when no AI could diagnose, and keeps nothing', async () => {
    const router = { runTask: () => Promise.reject(new LlmUnavailableError()) } as unknown as LlmRouter;
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, request())).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(results.size()).toBe(0);
  });

  it('[ENF-SEC-22] refuses a file that is not a PDF before queueing anything', async () => {
    const { queue } = immediateQueue();
    const docx = Buffer.from('PK\u0003\u0004 docx').toString('base64');

    await expect(serviceWith({ queue }).service.startAnalysis(7, { file: docx, offer: OFFER })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('[ENF-RGP-06] answers 404 for an analysis it no longer holds', () => {
    expect(() => serviceWith().service.findAnalysis(7, 99)).toThrow(expect.objectContaining({ statusCode: 404 }) as Error);
  });
});
