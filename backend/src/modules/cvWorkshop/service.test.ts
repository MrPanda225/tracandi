import { describe, expect, it, vi } from 'vitest';
import type { JobQueue, QueuedWork } from '../../jobs/queue.js';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { createAnalysisResults } from './results.js';
import { type CvAnalysis, createCvWorkshopService } from './service.js';

/** A queue that runs each treatment at once, as run 41. */
const immediateQueue = () => {
  const works: QueuedWork[] = [];
  const queue = {
    enqueue: vi.fn(async (work: QueuedWork) => {
      works.push(work);
      await work.run(() => undefined, 41);
      return 41;
    }),
  } as unknown as JobQueue;
  return { queue, works };
};

const noOcr = { readPages: vi.fn(() => Promise.reject(new Error('no OCR expected'))) };
const base64Cv = () => buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64');

describe('createCvWorkshopService', () => {
  it('[EF-CVX-32] queues the analysis as a manual cv_analysis of the candidate', async () => {
    const { queue, works } = immediateQueue();
    const service = createCvWorkshopService({ queue, ocr: noOcr, results: createAnalysisResults<CvAnalysis>() });

    expect(await service.startAnalysis(7, base64Cv())).toBe(41);
    expect(works[0]).toMatchObject({ userId: 7, job: 'cv_analysis', trigger: 'manual' });
  });

  it('[EF-CVX-21] [ENF-RGP-07] keeps the reading under the run, text without contact details', async () => {
    const results = createAnalysisResults<CvAnalysis>();
    const service = createCvWorkshopService({ queue: immediateQueue().queue, ocr: noOcr, results });

    await service.startAnalysis(7, base64Cv());

    const analysis = service.findAnalysis(7, 41);
    expect(analysis.reading.text).toContain('Atelier Nova');
    expect(analysis.reading.text).not.toContain('camille.durand@example.com');
    expect(analysis.reading.contacts.emails).toEqual(['camille.durand@example.com']);
  });

  it('[ENF-SEC-22] refuses a file that is not a PDF before queueing anything', async () => {
    const { queue } = immediateQueue();
    const service = createCvWorkshopService({ queue, ocr: noOcr, results: createAnalysisResults<CvAnalysis>() });

    await expect(service.startAnalysis(7, Buffer.from('PK\u0003\u0004 docx').toString('base64'))).rejects.toMatchObject(
      { statusCode: 400 },
    );
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('[ENF-RGP-06] answers 404 for an analysis it no longer holds', () => {
    const service = createCvWorkshopService({
      queue: immediateQueue().queue,
      ocr: noOcr,
      results: createAnalysisResults<CvAnalysis>(),
    });

    expect(() => service.findAnalysis(7, 99)).toThrow(expect.objectContaining({ statusCode: 404 }) as Error);
  });
});
