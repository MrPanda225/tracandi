import type { JobQueue } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { buildDiagnoseCvPrompt } from '../../llm/prompts/diagnoseCv.js';
import type { LlmRouter } from '../../llm/router.js';
import { buildDiagnosis, type Diagnosis, DiagnosisAnswerSchema } from './diagnosis.js';
import type { PdfOcr } from './ocr.js';
import { ANALYSES_PER_DAY, startOfParisDay } from './quota.js';
import { type ReadCv, readCv } from './reading.js';
import type { AnalysisResults } from './results.js';
import { decodeCvUpload } from './upload.js';

/** The result of an analysis, as the candidate gets it back. T-512 adds the adapted CV. */
export interface CvAnalysis {
  reading: ReadCv;
  diagnosis: Diagnosis;
}

/** What the candidate sends: the PDF in base64 and the text of the offer (EF-CVX-21, EF-CVX-23). */
export interface AnalysisRequest {
  file: string;
  offer: string;
}

/** EF-CVX-32: steps published while the analysis runs, for the screen to follow. */
const STEP_READ = 1;
const STEP_DIAGNOSED = 2;

/** Use cases of the CV workshop (EF-CVX-21 to 35). */
export interface CvWorkshopService {
  /**
   * Checks the CV and the daily allowance, then queues the analysis and hands back the run at once (EF-CVX-32).
   * Nothing of the CV or the offer is written anywhere (ENF-RGP-06).
   * @throws HttpError 413 beyond 5 MB, 400 when it is not a PDF, 429 after 5 analyses today — nothing is queued then.
   */
  startAnalysis: (userId: number, request: AnalysisRequest) => Promise<number>;
  /**
   * The result of a finished analysis of this candidate.
   * @throws NotFoundError when it is still running, erased after 30 minutes, or of another account.
   */
  findAnalysis: (userId: number, runId: number) => CvAnalysis;
}

/**
 * The CV workshop: the imported PDF is read in the queue (OCR included), its text — contact details taken out — is
 * diagnosed against the offer by the AI, and the result is kept 30 minutes in memory.
 * @req EF-CVX-21, EF-CVX-22, EF-CVX-24, EF-CVX-32, EF-CVX-33, ENF-RGP-06, ENF-RGP-07
 */
export const createCvWorkshopService = ({
  queue,
  ocr,
  router,
  results,
  clock,
}: {
  queue: JobQueue;
  ocr: PdfOcr;
  router: LlmRouter;
  results: AnalysisResults<CvAnalysis>;
  clock: Clock;
}): CvWorkshopService => ({
  async startAnalysis(userId, { file, offer }) {
    const pdf = decodeCvUpload(file);
    const today = await queue.countRunsSince(userId, 'cv_analysis', startOfParisDay(clock()));
    if (today >= ANALYSES_PER_DAY) {
      throw new HttpError(429, 'Vous avez fait vos 5 analyses du jour. Rendez-vous demain !');
    }
    return queue.enqueue({
      userId,
      job: 'cv_analysis',
      trigger: 'manual',
      run: async (report, runId) => {
        const reading = await readCv(pdf, { ocr });
        report({ cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount });
        const { data } = await router.runTask('diagnose_cv', {
          userId,
          ...buildDiagnoseCvPrompt({ cvText: reading.text, offerText: offer }),
          schema: DiagnosisAnswerSchema,
        });
        results.save(userId, runId, { reading, diagnosis: buildDiagnosis(data, reading.text) });
        return { cv_steps_done: STEP_DIAGNOSED, cv_pages_ocr: reading.ocrPageCount };
      },
    });
  },

  findAnalysis(userId, runId) {
    const analysis = results.find(userId, runId);
    if (!analysis) {
      throw new NotFoundError('Cette analyse n’est plus disponible : les résultats s’effacent au bout de 30 minutes.');
    }
    return analysis;
  },
});
