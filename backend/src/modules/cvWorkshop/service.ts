import type { JobQueue } from '../../jobs/queue.js';
import { NotFoundError } from '../../lib/errors.js';
import type { PdfOcr } from './ocr.js';
import { type ReadCv, readCv } from './reading.js';
import type { AnalysisResults } from './results.js';
import { decodeCvUpload } from './upload.js';

/** The result of an analysis, as the candidate gets it back. The next steps (T-511, T-512) add to it. */
export interface CvAnalysis {
  reading: ReadCv;
}

/** Use cases of the CV workshop (EF-CVX-21 to 34). */
export interface CvWorkshopService {
  /**
   * Checks the imported CV, then queues its analysis and hands back the run at once (EF-CVX-32). Nothing of the CV
   * is written anywhere (ENF-RGP-06).
   * @throws HttpError 413 beyond 5 MB, 400 when it is not a PDF — nothing is queued then.
   */
  startAnalysis: (userId: number, fileBase64: string) => Promise<number>;
  /**
   * The result of a finished analysis of this candidate.
   * @throws NotFoundError when it is still running, erased after 30 minutes, or of another account.
   */
  findAnalysis: (userId: number, runId: number) => CvAnalysis;
}

/**
 * The CV workshop: an imported PDF is read in the queue, OCR included, and its result kept 30 minutes in memory.
 * @req EF-CVX-21, EF-CVX-22, EF-CVX-32, ENF-RGP-06, ENF-RGP-07
 */
export const createCvWorkshopService = ({
  queue,
  ocr,
  results,
}: {
  queue: JobQueue;
  ocr: PdfOcr;
  results: AnalysisResults<CvAnalysis>;
}): CvWorkshopService => ({
  async startAnalysis(userId, fileBase64) {
    const pdf = decodeCvUpload(fileBase64);
    return queue.enqueue({
      userId,
      job: 'cv_analysis',
      trigger: 'manual',
      run: async (_report, runId) => {
        const reading = await readCv(pdf, { ocr });
        results.save(userId, runId, { reading });
        return { cv_pages_ocr: reading.ocrPageCount };
      },
    });
  },

  findAnalysis(userId, runId) {
    const analysis = results.find(userId, runId);
    if (!analysis) {
      throw new NotFoundError('Cette analyse est introuvable : son résultat est effacé 30 minutes après sa fin.');
    }
    return analysis;
  },
});
