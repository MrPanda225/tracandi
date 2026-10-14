import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { JobQueue, QueuedWork } from '../../jobs/queue.js';
import { LlmUnavailableError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { LlmRouter, RunTaskInput } from '../../llm/router.js';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { FICTITIOUS_STRUCTURE } from '../../../tests/fixtures/cv/structure.js';
import { readParagraphs } from '../../../tests/fixtures/docx/readDocx.js';
import { createAnalysisResults } from './results.js';
import { type CvAnalysis, createCvWorkshopService } from './service.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../tests/fixtures/llm/${name}.json`, import.meta.url), 'utf8'));
const ANSWER = fixture('diagnose_cv');
const TAILORED = fixture('tailor_cv') as Record<string, unknown>;
const STRUCTURE = FICTITIOUS_STRUCTURE;
const ref = (line: number, text: string) => ({ line, text });
const DEFAULT_ANSWERS = { parse_cv: STRUCTURE, diagnose_cv: ANSWER, tailor_cv: TAILORED };
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
 * an answer the schema rejects ends in LlmUnavailableError, as when every provider answered outside the schema.
 */
const scriptedRouter = (answers: Record<string, unknown> = DEFAULT_ANSWERS) => {
  const inputs: (RunTaskInput<unknown> & { task: string })[] = [];
  const router: LlmRouter = {
    runTask: <T>(task: string, input: RunTaskInput<T>) => {
      inputs.push({ ...(input as RunTaskInput<unknown>), task });
      const parsed = input.schema.safeParse(answers[task]);
      if (!parsed.success) return Promise.reject(new LlmUnavailableError(true));
      return Promise.resolve({ data: parsed.data, provider: 'groq_1' as const });
    },
  } as LlmRouter;
  return { router, inputs };
};

const logged: { message: string; context?: Record<string, unknown> }[] = [];
const logger: Logger = {
  info: (message, context) => logged.push({ message, context }),
  warn: (message, context) => logged.push({ message, context }),
  error: (message, context) => logged.push({ message, context }),
};
const noOcr = { readPages: vi.fn(() => Promise.reject(new Error('no OCR expected'))) };
const request = () => ({ file: buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64'), offer: OFFER });

const serviceWith = ({ queue = immediateQueue().queue, router = scriptedRouter().router, analysesPerDay = 5 } = {}) => {
  const results = createAnalysisResults<CvAnalysis>();
  const service = createCvWorkshopService({ queue, ocr: noOcr, router, results, clock: () => NOW, logger, analysesPerDay });
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

  it('[ENF-RGP-07] [ENF-SEC-06] sends the AI, at every step, the CV without contact details, and the offer, both framed', async () => {
    const { router, inputs } = scriptedRouter();

    await serviceWith({ router }).service.startAnalysis(7, request());

    const diagnosing = inputs.find((input) => input.task === 'diagnose_cv');
    expect(diagnosing?.userId).toBe(7);
    expect(diagnosing?.prompt).toContain('<cv>');
    expect(diagnosing?.prompt).toContain('<offer>');
    expect(diagnosing?.prompt).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78|Camille Durand/);
    for (const input of inputs) expect(input.prompt, input.task).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78|Camille Durand/);
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

  it('[EF-CVX-47] [RG-21] copies the facts from the CV, not from the model: dates, title and company are the CV’s own', async () => {
    const typed = {
      ...TAILORED,
      experiences: [{ id: 'exp_0', title: 'Lead Data Engineer', organization: 'Groupe Imaginaire', dates: '2030-2031', bullets: ['Conception de tableaux de bord.'] }],
    };
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, tailor_cv: typed });
    const { service } = serviceWith({ router });

    await service.startAnalysis(7, request());

    expect(service.findAnalysis(7, 41).adapted.cv.experiences[0]).toMatchObject({
      title: 'Data Analyst',
      organization: 'Atelier Nova',
      dates: '09/2024 - 08/2026',
    });
    expect(service.findAnalysis(7, 41).adapted.cv.education[0]).toMatchObject({ school: 'Universite de Lyon', dates: '2024' });
  });

  it('[EF-CVX-47] [RG-21] removes a bullet with a figure the CV does not carry instead of failing the adaptation', async () => {
    const answer = {
      ...TAILORED,
      experiences: [{ id: 'exp_0', bullets: ['Gestion de 40 serveurs.', 'Conception de tableaux de bord pour 12 équipes.'] }],
    };
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, tailor_cv: answer });
    const { service } = serviceWith({ router });

    await service.startAnalysis(7, request());

    expect(service.findAnalysis(7, 41).adapted.cv.experiences[0]?.bullets).toEqual(['Conception de tableaux de bord pour 12 équipes.']);
  });

  it('[EF-CVX-26] says no AI gave a usable answer, and keeps nothing, only when every provider’s answer is unusable', async () => {
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, tailor_cv: 'Voici votre CV adapté !' });
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 502,
      message: 'On n’a pas réussi à adapter votre CV. Réessayez dans un instant.',
    });
    expect(results.size()).toBe(0);
  });

  it('[RG-21] keeps the adapted CV with only the skills the CV has, ignoring an id it does not have', async () => {
    const extra = { ...TAILORED, skills: ['skill_0', 'skill_9', 'skill_1'] };
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, tailor_cv: extra });
    const { service } = serviceWith({ router });

    await service.startAnalysis(7, request());

    expect(service.findAnalysis(7, 41).adapted.cv.skills).toEqual(['SQL', 'Python']);
  });

  it('[EF-CVX-46] ends the run with a clear message when no experience nor education could be found in the CV', async () => {
    const empty = { ...STRUCTURE, experiences: [], education: [] };
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, parse_cv: empty });
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('Nous n’avons pas pu retrouver vos expériences et formations') as string,
    });
    expect(results.size()).toBe(0);
  });

  it('[ENF-SEC-08] logs the counts of the parsing, never a value of the CV', async () => {
    logged.length = 0;

    await serviceWith().service.startAnalysis(7, request());

    expect(logged).toContainEqual({ message: 'cv parsed', context: { dropped: 0, experiences: 1, education: 1 } });
    expect(JSON.stringify(logged)).not.toMatch(/Atelier Nova|Master Informatique/);
  });

  it('[RG-24] [EF-CVX-37] trims a long CV to one page and keeps every entry line', async () => {
    const lines = ['Camille Durand', 'Data Analyst', 'EXPERIENCES PROFESSIONNELLES'];
    const organization = 'Societe de conseil en systemes information '.repeat(3).trim();
    const experiences = Array.from({ length: 12 }, (_unused, index) => {
      lines.push(`09/20${String(10 + index)} - 08/20${String(11 + index)}  Data Analyst - ${organization} ${String(index)}`);
      for (let bullet = 0; bullet < 4; bullet += 1) lines.push(`Conception et suivi de tableaux de bord Power BI pour les équipes numéro ${String(index)}${String(bullet)}.`);
      const first = lines.length - 4;
      return {
        title: ref(first, 'Data Analyst'),
        organization: ref(first, `${organization} ${String(index)}`),
        place: null,
        dates: ref(first, `09/20${String(10 + index)} - 08/20${String(11 + index)}`),
        bullets: [1, 2, 3, 4].map((offset) => ref(first + offset, lines[first + offset] ?? '')),
      };
    });
    const structure = { ...STRUCTURE, experiences, education: [], skills: [] };
    const answer = {
      ...TAILORED,
      experiences: experiences.map((_experience, index) => ({ id: `exp_${String(index)}`, bullets: lines.slice(4 + index * 5, 8 + index * 5).map((line) => line.replace(/\.$/u, '')) })),
      changes: [],
    };
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, parse_cv: structure, tailor_cv: answer });
    const { service } = serviceWith({ router });
    const file = buildTextPdf([lines]).toString('base64');

    await service.startAnalysis(7, { file, offer: OFFER });

    const { cv } = service.findAnalysis(7, 41).adapted;
    expect(cv.experiences).toHaveLength(12);
    const counts = cv.experiences.map((experience) => experience.bullets.length);
    const total = counts.reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(48);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('[RG-24] says so, in words of its own, when the CV does not hold on a page even without its achievements', async () => {
    // Each entry wraps over three lines of the PDF, as a long company name does: 20 of them fill more than a page.
    const lines = ['Camille Durand', 'Data Analyst', 'EXPERIENCES PROFESSIONNELLES'];
    const experiences = Array.from({ length: 20 }, (_unused, index) => {
      const first = lines.length;
      const organization = [
        `Societe de conseil en systemes information numero ${String(index)} et de services`,
        'aux entreprises de la region lyonnaise, groupe international de conseil en transformation',
        'numerique et en strategie des donnees pour les grands comptes',
      ];
      lines.push(`Data Analyst - ${organization[0] ?? ''}`, organization[1] ?? '', organization[2] ?? '');
      return {
        title: ref(first, 'Data Analyst'),
        organization: { line: first, toLine: first + 2, text: `${organization[0] ?? ''} ${organization[1] ?? ''} ${organization[2] ?? ''}` },
        place: null,
        dates: null,
        bullets: [],
      };
    });
    const { router } = scriptedRouter({ ...DEFAULT_ANSWERS, parse_cv: { ...STRUCTURE, experiences, education: [], skills: [] } });
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, { file: buildTextPdf([lines]).toString('base64'), offer: OFFER })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('ne tient pas sur une page même sans ses réalisations') as string,
    });
    expect(results.size()).toBe(0);
  });

  it('[EF-IA-04] [EF-CVX-26] says the AI is out of reach, not that it invented, when no provider answered', async () => {
    const router = {
      runTask: (task: string, input: RunTaskInput<unknown>) =>
        task === 'tailor_cv'
          ? Promise.reject(new LlmUnavailableError())
          : Promise.resolve({ data: input.schema.parse(task === 'parse_cv' ? STRUCTURE : ANSWER), provider: 'groq_1' as const }),
    } as unknown as LlmRouter;
    const { service, results } = serviceWith({ router });

    await expect(service.startAnalysis(7, request())).rejects.toMatchObject({
      statusCode: 502,
      message: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
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
