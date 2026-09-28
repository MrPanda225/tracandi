import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JobQueue, QueuedWork } from '../../jobs/queue.js';
import { LlmUnavailableError } from '../../lib/errors.js';
import type { LlmRouter, RunTaskInput } from '../../llm/router.js';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { readParagraphs } from '../../../tests/fixtures/docx/readDocx.js';
import { createAnalysisResults } from './results.js';
import { type CvAnalysis, createCvWorkshopService } from './service.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../tests/fixtures/llm/${name}.json`, import.meta.url), 'utf8'));
const ANSWER = fixture('diagnose_cv');
const TAILORED = fixture('tailor_cv') as { cv: { experiences: object[] } };
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

/**
 * A router whose provider answers the fixture of each task, parsed by the schema of the task as the real router does:
 * an answer the schema rejects ends in LlmUnavailableError, as when every provider failed.
 */
const scriptedRouter = (answers: Record<string, unknown> = { diagnose_cv: ANSWER, tailor_cv: TAILORED }) => {
  const inputs: (RunTaskInput<unknown> & { task: string })[] = [];
  const router: LlmRouter = {
    runTask: <T>(task: string, input: RunTaskInput<T>) => {
      inputs.push({ ...(input as RunTaskInput<unknown>), task });
      const parsed = input.schema.safeParse(answers[task]);
      if (!parsed.success) return Promise.reject(new LlmUnavailableError());
      return Promise.resolve({ data: parsed.data, provider: 'groq_1' as const });
    },
  } as LlmRouter;
  return { router, inputs };
};

const noOcr = { readPages: vi.fn(() => Promise.reject(new Error('no OCR expected'))) };
const request = () => ({ file: buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64'), offer: OFFER });

const serviceWith = ({ queue = immediateQueue().queue, router = scriptedRouter().router, analysesPerDay = 5 } = {}) => {
  const results = createAnalysisResults<CvAnalysis>();
  const service = createCvWorkshopService({ queue, ocr: noOcr, router, results, clock: () => NOW, analysesPerDay });
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

  it('[EF-CVX-32] publishes the reading, then the diagnostic, as done before the adaptation', async () => {
    const { queue, reports } = immediateQueue();

    await serviceWith({ queue }).service.startAnalysis(7, request());

    expect(reports).toEqual([
      { cv_steps_done: 1, cv_pages_ocr: 0 },
      { cv_steps_done: 2, cv_pages_ocr: 0 },
    ]);
  });

  it('[EF-CVX-25] [EF-CVX-29] keeps the adapted CV and each of its changes', async () => {
    const { service } = serviceWith();

    await service.startAnalysis(7, request());

    const { adapted } = service.findAnalysis(7, 41);
    expect(adapted.cv.experiences[0]?.organization).toBe('Atelier Nova');
    expect(adapted.changes[0]).toMatchObject({ section: 'Expériences professionnelles', reason: expect.any(String) as string });
  });

  it('[EF-CVX-26] never shows an adapted CV that invents, and says so when no provider stayed faithful', async () => {
    const invented = { ...TAILORED, cv: { ...TAILORED.cv, experiences: [{ ...TAILORED.cv.experiences[0], organization: 'Groupe Imaginaire' }] } };
    const { router } = scriptedRouter({ diagnose_cv: ANSWER, tailor_cv: invented });
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 502,
      message: 'On n’a pas réussi à adapter votre CV sans rien inventer. Réessayez dans un instant.',
    });
    expect(results.size()).toBe(0);
  });

  it('[ENF-RGP-07] [RG-21] gives the adaptation the CV without contact details, and the skills to leave out', async () => {
    const { router, inputs } = scriptedRouter();

    await serviceWith({ router }).service.startAnalysis(7, request());

    const tailoring = inputs.find((input) => input.task === 'tailor_cv');
    expect(tailoring?.prompt).toContain('Atelier Nova');
    expect(tailoring?.prompt).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78|Camille Durand/);
    expect(tailoring?.prompt).toContain('Compétences absentes du CV, à ne pas ajouter : dbt, Airflow');
  });

  it('[EF-CVX-31] [EF-CVX-28] writes the Word file with the skills the candidate ticked, contacts put back', async () => {
    const { service } = serviceWith();
    await service.startAnalysis(7, request());

    const paragraphs = readParagraphs(await service.renderDocx(7, 41, ['Airflow']));

    expect(paragraphs[0]).toBe('Camille Durand');
    expect(paragraphs).toContain('SQL, Python, Power BI, Airflow');
    expect(service.findAnalysis(7, 41).diagnosis.overallScore).toBe(70);
  });

  it('[EF-CVX-28] refuses to add a skill the diagnostic did not list', async () => {
    const { service } = serviceWith();
    await service.startAnalysis(7, request());

    await expect(service.renderDocx(7, 41, ['Kubernetes'])).rejects.toMatchObject({ statusCode: 400 });
  });

  it('[ENF-RGP-06] answers 404 for the Word file of an analysis it no longer holds', async () => {
    await expect(serviceWith().service.renderDocx(7, 99, [])).rejects.toMatchObject({ statusCode: 404 });
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

  it('[EF-CVX-33] follows the allowance of the deployment, its number in the message', async () => {
    const { queue } = immediateQueue(20);

    await expect(serviceWith({ queue, analysesPerDay: 20 }).service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 429,
      message: 'Vous avez fait vos 20 analyses du jour. Rendez-vous demain !',
    });
  });

  it('[EF-CVX-33] lifts the allowance when the deployment sets it to 0, for tests', async () => {
    const { queue } = immediateQueue(500);

    expect(await serviceWith({ queue, analysesPerDay: 0 }).service.startAnalysis(7, request())).toBe(41);
    expect(queue.countRunsSince).not.toHaveBeenCalled();
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
