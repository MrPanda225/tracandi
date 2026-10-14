import type { Database } from '../../db/client.js';
import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { createKeyedMutex } from '../../lib/async.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { startOfParisDay } from '../../lib/parisTime.js';
import { buildDeduceProfilePrompt } from '../../llm/prompts/deduceProfile.js';
import type { LlmRouter } from '../../llm/router.js';
import type { PdfOcr } from '../cvWorkshop/ocr.js';
import type { PdfTextLayer } from '../cvWorkshop/pdftotext.js';
import { readCv } from '../cvWorkshop/reading.js';
import type { AnalysisResults } from '../cvWorkshop/results.js';
import { decodeCvUpload } from '../cvWorkshop/upload.js';
import { buildProfileDeduction, type ProfileDeduction, ProfileDeductionAnswerSchema } from './deduction.js';
import * as repository from './repository.js';
import { CV_TYPES_MAX, type CvTypeView, type ImportCvTypeBody, type ReplaceCvTypeBody } from './schemas.js';

const CV_TYPE_NOT_FOUND = 'Ce CV type est introuvable.';
const TOO_MANY = `Vous avez déjà ${String(CV_TYPES_MAX)} CV types : supprimez-en un pour en importer un autre.`;
const DEDUCTION_GONE =
  'Le profil déduit de ce CV n’est plus disponible : il s’efface au bout de 30 minutes. Importez de nouveau le CV.';

/** EF-CVX-43: steps published while a CV type is read, for the screen to follow. */
const STEP_READ = 1;
const STEP_DEDUCED = 2;

export interface CvTypesService {
  /** @req EF-CVX-39 */
  list: (userId: number) => Promise<{ items: CvTypeView[]; maxItems: number }>;
  /**
   * Checks the file, the allowance of the day and the room left, then queues its reading and the deduction from it, and
   * hands back the run at once (EF-CVX-43). Nothing of the CV is written anywhere: only the label and what is worked
   * out from it (ENF-RGP-14).
   * @throws HttpError 413 beyond 5 MB, 400 when it is not a PDF, 429 after the allowance of the day, 409 when the
   * candidate holds 4 CV types already.
   * @returns the identifier of the execution, to follow it (EF-EXE-03).
   * @req EF-CVX-39, EF-CVX-40, EF-CVX-43, EF-CVX-44
   */
  startImport: (userId: number, body: ImportCvTypeBody) => Promise<number>;
  /**
   * Same for the new file of a CV type; the old one stays as it is until the new one is read and deduced from
   * (EF-CVX-41).
   * @throws NotFoundError when the CV type is not the candidate's.
   * @req EF-CVX-41
   */
  startReplacement: (userId: number, id: number, body: ReplaceCvTypeBody) => Promise<number>;
  /** @throws NotFoundError when the CV type is not the candidate's. @req EF-CVX-42 */
  remove: (userId: number, id: number) => Promise<void>;
  /**
   * What was deduced from this CV type, while it is kept in memory.
   * @throws NotFoundError when it is erased (30 minutes), never was, or the CV type is not the candidate's.
   * @req EF-VEI-43, EF-VEI-45
   */
  findDeduction: (userId: number, id: number) => ProfileDeduction;
}

export interface CvTypesServiceDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  ocr: PdfOcr;
  /** EF-CVX-45: poppler's reading of the text layer; pdf.js alone when left out. */
  textLayer?: PdfTextLayer;
  router: LlmRouter;
  /** The deductions waiting for the candidate's validation, by CV type: in memory only (ENF-RGP-14). */
  deductions: AnalysisResults<ProfileDeduction>;
  /** EF-CVX-44: deductions per candidate and per day, Paris time; 0 lifts the limit. */
  deductionsPerDay: number;
}

/**
 * EF-CVX-43, EF-VEI-43, EF-VEI-45: the reading of the CV, then the model's periods and offers; the years and the level
 * are the code's (RG-28, RG-29). The local model leads: nobody waits at the screen for this run (EF-IA-08).
 */
const deduceFrom = async (
  { ocr, textLayer, router, clock }: CvTypesServiceDeps,
  { userId, pdf }: { userId: number; pdf: Buffer },
  report: (counters: RunCounters) => void,
): Promise<{ deduction: ProfileDeduction; counters: RunCounters }> => {
  const reading = await readCv(pdf, { ocr, textLayer });
  report({ cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount });
  const { data } = await (router.forMode?.('scheduled') ?? router).runTask('deduce_profile', {
    userId,
    ...buildDeduceProfilePrompt({ cvText: reading.text }),
    schema: ProfileDeductionAnswerSchema,
  });
  const counters = { cv_steps_done: STEP_DEDUCED, cv_pages_ocr: reading.ocrPageCount };
  report(counters);
  return { deduction: buildProfileDeduction(data, clock()), counters };
};

const viewOf = (row: repository.CvTypeRow, deductionReady: boolean): CvTypeView => ({
  id: row.id,
  label: row.label,
  years: row.years,
  level: row.level,
  deductionReady,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** EF-CVX-44: refuses a new deduction once the allowance of the day is spent; a failed one costs nothing. */
const checkAllowance = async (
  { queue, clock, deductionsPerDay }: CvTypesServiceDeps,
  userId: number,
): Promise<void> => {
  if (deductionsPerDay === 0) return;
  const today = await queue.countRunsSince(userId, 'profile_deduction', startOfParisDay(clock()));
  if (today >= deductionsPerDay) {
    throw new HttpError(
      429,
      `Vous avez lancé vos ${String(deductionsPerDay)} lectures de CV du jour. Rendez-vous demain !`,
    );
  }
};

/**
 * The run of an import: the CV is read and deduced from first, so that a CV that cannot be read, or that no model could
 * answer about, costs the candidate none of their four places. The count is checked again when it is kept (EF-CVX-39).
 */
const importRun =
  (deps: CvTypesServiceDeps, { userId, label, pdf }: { userId: number; label: string; pdf: Buffer }) =>
  async (report: (counters: RunCounters) => void): Promise<RunCounters> => {
    const { deduction, counters } = await deduceFrom(deps, { userId, pdf }, report);
    const row = await repository.insertCvType(deps.db, {
      userId,
      label,
      profile: deduction,
      now: deps.clock(),
      max: CV_TYPES_MAX,
    });
    if (!row) throw new HttpError(409, TOO_MANY);
    deps.deductions.save(userId, row.id, deduction);
    return counters;
  };

/**
 * The run of a replacement: the old profile goes only once the new file is read and deduced from, so that an unreadable
 * file leaves the CV type as it was (EF-CVX-41).
 */
const replacementRun =
  (deps: CvTypesServiceDeps, { userId, id, pdf }: { userId: number; id: number; pdf: Buffer }) =>
  async (report: (counters: RunCounters) => void): Promise<RunCounters> => {
    const { deduction, counters } = await deduceFrom(deps, { userId, pdf }, report);
    const kept = await repository.updateCvTypeProfile(deps.db, {
      userId,
      id,
      profile: deduction,
      now: deps.clock(),
    });
    if (!kept) throw new NotFoundError(CV_TYPE_NOT_FOUND);
    deps.deductions.save(userId, id, deduction);
    return counters;
  };

/**
 * EF-CVX-39 to EF-CVX-44: the CV types of a candidate — at most four, each read in the queue with the controls of the
 * CV workshop (format, size, OCR, locked or damaged file) and deduced from before anything is kept of it.
 */
const createService = (deps: CvTypesServiceDeps): CvTypesService => {
  const { db, queue, deductions } = deps;
  /** Imports asked for and not over yet, per candidate: they count against the four places as soon as asked. */
  const pendingImports = new Map<number, number>();
  const pendingOf = (userId: number): number => pendingImports.get(userId) ?? 0;
  const addPending = (userId: number, delta: number): void => {
    pendingImports.set(userId, Math.max(0, pendingOf(userId) + delta));
  };

  return {
    async list(userId) {
      const rows = await repository.listCvTypes(db, userId);
      return {
        items: rows.map((row) => viewOf(row, deductions.find(userId, row.id) !== null)),
        maxItems: CV_TYPES_MAX,
      };
    },

    async startImport(userId, { label, file }) {
      const pdf = decodeCvUpload(file);
      await checkAllowance(deps, userId);
      if ((await repository.countCvTypes(db, userId)) + pendingOf(userId) >= CV_TYPES_MAX) {
        throw new HttpError(409, TOO_MANY);
      }
      addPending(userId, 1);
      const run = importRun(deps, { userId, label, pdf });
      try {
        return await queue.enqueue({
          userId,
          job: 'profile_deduction',
          trigger: 'manual',
          run: (report) => run(report).finally(() => addPending(userId, -1)),
        });
      } catch (error) {
        addPending(userId, -1);
        throw error;
      }
    },

    async startReplacement(userId, id, { file }) {
      if (!(await repository.findCvType(db, userId, id))) throw new NotFoundError(CV_TYPE_NOT_FOUND);
      const pdf = decodeCvUpload(file);
      await checkAllowance(deps, userId);
      return queue.enqueue({
        userId,
        job: 'profile_deduction',
        trigger: 'manual',
        run: replacementRun(deps, { userId, id, pdf }),
      });
    },

    async remove(userId, id) {
      if (!(await repository.deleteCvType(db, userId, id))) throw new NotFoundError(CV_TYPE_NOT_FOUND);
      deductions.erase(userId, id);
    },

    findDeduction(userId, id) {
      const deduction = deductions.find(userId, id);
      if (!deduction) throw new NotFoundError(DEDUCTION_GONE);
      return deduction;
    },
  };
};

/**
 * ENF-COU-01, EF-CVX-44: the requests of one candidate that read a count and then write it — the daily allowance, the
 * four places — are served one after the other, so that twenty requests sent together do not all read the same count.
 */
const serialised = (service: CvTypesService): CvTypesService => {
  const exclusively = createKeyedMutex<number>();
  return {
    ...service,
    startImport: (userId, body) => exclusively(userId, () => service.startImport(userId, body)),
    startReplacement: (userId, id, body) =>
      exclusively(userId, () => service.startReplacement(userId, id, body)),
  };
};

export const createCvTypesService = (deps: CvTypesServiceDeps): CvTypesService =>
  serialised(createService(deps));
