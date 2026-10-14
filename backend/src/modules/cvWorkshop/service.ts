import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, LlmUnavailableError, NotFoundError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { buildDiagnoseCvPrompt } from '../../llm/prompts/diagnoseCv.js';
import { buildTailorCvPrompt } from '../../llm/prompts/tailorCv.js';
import type { LlmRouter } from '../../llm/router.js';
import { renderAtsDocx } from './atsDocx.js';
import { buildDiagnosis, DIMENSIONS, type Diagnosis, DiagnosisAnswerSchema } from './diagnosis.js';
import type { AdaptedCv } from './adaptedCv.js';
import type { ParsedCv } from './anchoring.js';
import { assembleCv, buildChanges, type CvChange } from './assembly.js';
import type { CvContacts } from './contacts.js';
import { CvUnreadableError } from './errors.js';
import { unfaithfulPaths } from './fidelity.js';
import type { PdfOcr } from './ocr.js';
import { fitToOnePage, MAX_RESERVED_SKILLS } from './onePage.js';
import { parseCv } from './parsing.js';
import { TailorCvAnswerSchema } from './tailorCvAnswer.js';
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
  adapted: { cv: AdaptedCv; changes: CvChange[] };
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

/** EF-CVX-26: said when no provider gave a usable answer (quota and overload are told apart, EF-IA-04). */
const UNFAITHFUL = 'On n’a pas réussi à adapter votre CV. Réessayez dans un instant.';

/** RG-24: said when the CV, stripped of its achievements, still does not hold on one page. */
const TOO_LONG =
  'Votre CV ne tient pas sur une page même sans ses réalisations : il compte trop d’expériences ou de formations. ' +
  'Importez une version plus courte.';

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
  router: LlmRouter;
  results: AnalysisResults<CvAnalysis>;
  clock: Clock;
  logger: Logger;
  /** EF-CVX-33: analyses per candidate and per day, Paris time; 0 lifts the limit. */
  analysesPerDay: number;
}

/**
 * EF-CVX-25, EF-CVX-47, RG-21, RG-24: the adapted CV. The model chooses and rewrites; the code copies the facts from the
 * parsed CV, trims to one page and checks the result. When no provider gave a usable answer, the failure says so; when
 * no provider answered at all (quota, overload), it says that instead (EF-IA-04).
 * @throws HttpError 502 for an unusable answer or a CV that cannot hold on one page, even trimmed
 */
const tailorCv = async (
  { router, logger }: Pick<ServiceDeps, 'router' | 'logger'>,
  {
    userId,
    parsed,
    sourceText,
    contacts,
    offerText,
    diagnosis,
  }: {
    userId: number;
    parsed: ParsedCv;
    sourceText: string;
    contacts: CvContacts;
    offerText: string;
    diagnosis: Diagnosis;
  },
): Promise<{ cv: AdaptedCv; changes: CvChange[] }> => {
  let answer;
  try {
    ({ data: answer } = await router.runTask('tailor_cv', {
      userId,
      ...buildTailorCvPrompt({
        cv: parsed,
        offerText,
        diagnosis: {
          explanations: DIMENSIONS.map((dimension) => diagnosis.dimensions[dimension].explanation),
          missingSkills: diagnosis.missingSkills,
        },
      }),
      schema: TailorCvAnswerSchema,
    }));
  } catch (error) {
    if (error instanceof LlmUnavailableError && error.answerRejected) throw new HttpError(502, UNFAITHFUL);
    throw error;
  }
  const assembled = assembleCv({ parsed, answer, sourceText });
  const cv = fitToOnePage(assembled, {
    contacts,
    addedSkills: diagnosis.missingSkills.slice(0, MAX_RESERVED_SKILLS),
  });
  if (cv === null) throw new HttpError(502, TOO_LONG);
  const unfaithful = unfaithfulPaths(cv, sourceText);
  if (unfaithful.length > 0) {
    // A bug of the assembly, never the candidate's fault: the paths only, never their values (ENF-SEC-08).
    logger.error('assembled CV not faithful to the source', { paths: unfaithful.map((path) => path.join('.')) });
    throw new HttpError(502, UNFAITHFUL);
  }
  return { cv, changes: buildChanges({ parsed, answer, cv }) };
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
 * EF-CVX-46: the CV structured. Counts only are logged (ENF-SEC-08).
 * @throws CvUnreadableError `noStructure` when no experience nor education could be found in it
 */
const parseStructure = async (
  { router, logger }: Pick<ServiceDeps, 'router' | 'logger'>,
  input: { userId: number; text: string },
): Promise<ParsedCv> => {
  const parsed = await parseCv(router, input);
  logger.info('cv parsed', {
    dropped: parsed.dropped,
    experiences: parsed.experiences.length,
    education: parsed.education.length,
  });
  if (parsed.experiences.length === 0 && parsed.education.length === 0) throw new CvUnreadableError('noStructure');
  return parsed;
};

/**
 * The analysis itself, run by the queue: reading (OCR included) and structure, diagnostic against the offer, then the adapted CV,
 * each step published as it ends (EF-CVX-32). The result is kept under the run, in memory only (ENF-RGP-06).
 */
const analyse =
  (
    deps: ServiceDeps,
    { userId, pdf, offer }: { userId: number; pdf: Buffer; offer: string },
  ) =>
  async (report: (counters: RunCounters) => void, runId: number): Promise<RunCounters> => {
    const reading = await readCv(pdf, { ocr: deps.ocr });
    const parsed = await parseStructure(deps, { userId, text: reading.text });
    report({ cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount });
    const { data } = await deps.router.runTask('diagnose_cv', {
      userId,
      ...buildDiagnoseCvPrompt({ cvText: reading.text, offerText: offer }),
      schema: DiagnosisAnswerSchema,
    });
    const diagnosis = buildDiagnosis(data, reading.text);
    report({ cv_steps_done: STEP_DIAGNOSED, cv_pages_ocr: reading.ocrPageCount });
    const adapted = await tailorCv(deps, {
      userId,
      parsed,
      sourceText: reading.text,
      contacts: reading.contacts,
      offerText: offer,
      diagnosis,
    });
    deps.results.save(userId, runId, { reading, diagnosis, adapted });
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
