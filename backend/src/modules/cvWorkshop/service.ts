import { z } from 'zod';
import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, LlmUnavailableError, NotFoundError } from '../../lib/errors.js';
import { buildDiagnoseCvPrompt } from '../../llm/prompts/diagnoseCv.js';
import { buildTailorCvPrompt } from '../../llm/prompts/tailorCv.js';
import type { LlmRouter } from '../../llm/router.js';
import { renderAtsDocx } from './atsDocx.js';
import { buildDiagnosis, DIMENSIONS, type Diagnosis, DiagnosisAnswerSchema } from './diagnosis.js';
import { type TailoredAnswer, tailoredAnswerSchemaFor } from './fidelity.js';
import type { CvContacts } from './contacts.js';
import type { PdfOcr } from './ocr.js';
import type { PdfTextLayer } from './pdftotext.js';
import { fitsOnOnePage } from './onePage.js';
import { startOfParisDay } from './quota.js';
import { type ReadCv, readCv } from './reading.js';
import type { AnalysisResults } from './results.js';
import { foldText } from './text.js';
import { decodeCvUpload } from './upload.js';

/** The result of an analysis, as the candidate gets it back. */
export interface CvAnalysis {
  reading: ReadCv;
  diagnosis: Diagnosis;
  /** EF-CVX-25, EF-CVX-29: the CV adapted to the offer, faithful to the imported one (RG-21), and its changes. */
  adapted: TailoredAnswer;
}

/** What the candidate sends: the PDF in base64 and the text of the offer (EF-CVX-21, EF-CVX-23). */
export interface AnalysisRequest {
  file: string;
  offer: string;
}

/** EF-CVX-32: steps published while the analysis runs, for the screen to follow. */
const STEP_READ = 1;
const STEP_DIAGNOSED = 2;
const STEP_ADAPTED = 3;

/** EF-CVX-26, EF-CVX-37: said when no provider wrote an adapted CV that invents nothing and holds on one page. */
const UNFAITHFUL = 'On n’a pas réussi à adapter votre CV fidèlement et sur une page. Réessayez dans un instant.';

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
  /**
   * The adapted CV as a Word file readable by recruiting software (RG-22), contact details put back, with the missing
   * skills the candidate ticked (EF-CVX-28). The score is left as it is.
   * @throws NotFoundError as findAnalysis; HttpError 400 for a skill the diagnostic did not list.
   */
  renderDocx: (userId: number, runId: number, addedSkills: readonly string[]) => Promise<Buffer>;
}

interface ServiceDeps {
  queue: JobQueue;
  ocr: PdfOcr;
  /** EF-CVX-45: poppler's reading of the text layer; pdf.js alone when left out. */
  textLayer?: PdfTextLayer;
  router: LlmRouter;
  results: AnalysisResults<CvAnalysis>;
  clock: Clock;
  /** EF-CVX-33: analyses per candidate and per day, Paris time; 0 lifts the limit. */
  analysesPerDay: number;
}

/**
 * EF-CVX-37, RG-24: what an adapted CV must meet — faithful to the imported CV (RG-21) and on one A4 page with its
 * contact details and every missing skill the candidate may still tick (EF-CVX-28). A longer one is rejected like an
 * unfaithful one, so the router asks the next provider (EF-IA-02).
 */
const tailoredSchemaFor = ({ cvText, contacts, diagnosis }: { cvText: string; contacts: CvContacts; diagnosis: Diagnosis }) =>
  tailoredAnswerSchemaFor(cvText).superRefine((answer, context) => {
    if (!fitsOnOnePage({ cv: answer.cv, contacts, addedSkills: diagnosis.missingSkills })) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['cv'], message: 'Longer than one A4 page (RG-24)' });
    }
  });

/**
 * EF-CVX-25, EF-CVX-26, EF-CVX-37: the adapted CV, or a plain failure when no provider wrote one faithful to the CV
 * (RG-21) and holding on one page (RG-24). When no provider answered at all (quota, overload), the failure says so
 * instead (EF-IA-04).
 */
const tailorCv = async (
  router: LlmRouter,
  {
    userId,
    cvText,
    contacts,
    offerText,
    diagnosis,
  }: { userId: number; cvText: string; contacts: CvContacts; offerText: string; diagnosis: Diagnosis },
): Promise<TailoredAnswer> => {
  try {
    const { data } = await router.runTask('tailor_cv', {
      userId,
      ...buildTailorCvPrompt({
        cvText,
        offerText,
        diagnosis: {
          explanations: DIMENSIONS.map((dimension) => diagnosis.dimensions[dimension].explanation),
          missingSkills: diagnosis.missingSkills,
        },
      }),
      schema: tailoredSchemaFor({ cvText, contacts, diagnosis }),
    });
    return data;
  } catch (error) {
    if (error instanceof LlmUnavailableError && error.answerRejected) throw new HttpError(502, UNFAITHFUL);
    throw error;
  }
};

/** EF-CVX-33: refuses a new analysis once the allowance of the day is spent. */
const checkAllowance = async (
  { queue, clock, analysesPerDay }: ServiceDeps,
  userId: number,
): Promise<void> => {
  if (analysesPerDay === 0) return;
  const today = await queue.countRunsSince(userId, 'cv_analysis', startOfParisDay(clock()));
  if (today >= analysesPerDay) {
    throw new HttpError(
      429,
      `Vous avez fait vos ${String(analysesPerDay)} analyses du jour. Rendez-vous demain !`,
    );
  }
};

/**
 * The analysis itself, run by the queue: reading (OCR included), diagnostic against the offer, then the adapted CV,
 * each step published as it ends (EF-CVX-32). The result is kept under the run, in memory only (ENF-RGP-06).
 */
const analyse =
  (
    { ocr, textLayer, router, results }: ServiceDeps,
    { userId, pdf, offer }: { userId: number; pdf: Buffer; offer: string },
  ) =>
  async (report: (counters: RunCounters) => void, runId: number): Promise<RunCounters> => {
    const reading = await readCv(pdf, { ocr, textLayer });
    report({ cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount });
    const { data } = await router.runTask('diagnose_cv', {
      userId,
      ...buildDiagnoseCvPrompt({ cvText: reading.text, offerText: offer }),
      schema: DiagnosisAnswerSchema,
    });
    const diagnosis = buildDiagnosis(data, reading.text);
    report({ cv_steps_done: STEP_DIAGNOSED, cv_pages_ocr: reading.ocrPageCount });
    const adapted = await tailorCv(router, {
      userId,
      cvText: reading.text,
      contacts: reading.contacts,
      offerText: offer,
      diagnosis,
    });
    results.save(userId, runId, { reading, diagnosis, adapted });
    return { cv_steps_done: STEP_ADAPTED, cv_pages_ocr: reading.ocrPageCount };
  };

/**
 * The CV workshop: the imported PDF is read in the queue (OCR included), its text — contact details taken out — is
 * diagnosed against the offer, then adapted to it faithfully (RG-21); the result stays 30 minutes in memory and the
 * adapted CV is downloaded as a Word file readable by recruiting software (RG-22).
 * @req EF-CVX-21, EF-CVX-22, EF-CVX-24, EF-CVX-25, EF-CVX-26, EF-CVX-28, EF-CVX-31, EF-CVX-32, EF-CVX-33,
 * ENF-RGP-06, ENF-RGP-07
 */
export const createCvWorkshopService = (deps: ServiceDeps): CvWorkshopService => {
  const findAnalysis = (userId: number, runId: number): CvAnalysis => {
    const analysis = deps.results.find(userId, runId);
    if (!analysis) {
      throw new NotFoundError(
        'Cette analyse n’est plus disponible : les résultats s’effacent au bout de 30 minutes.',
      );
    }
    return analysis;
  };

  return {
    async startAnalysis(userId, { file, offer }) {
      const pdf = decodeCvUpload(file);
      await checkAllowance(deps, userId);
      return deps.queue.enqueue({
        userId,
        job: 'cv_analysis',
        trigger: 'manual',
        run: analyse(deps, { userId, pdf, offer }),
      });
    },

    findAnalysis,

    async renderDocx(userId, runId, addedSkills) {
      const { reading, diagnosis, adapted } = findAnalysis(userId, runId);
      const listed = new Set(diagnosis.missingSkills.map(foldText));
      if (addedSkills.some((skill) => !listed.has(foldText(skill)))) {
        throw new HttpError(400, 'Seules les compétences listées par le diagnostic peuvent être ajoutées.');
      }
      return renderAtsDocx({ cv: adapted.cv, contacts: reading.contacts, addedSkills });
    },
  };
};
