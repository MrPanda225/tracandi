import type { Database } from '../../db/client.js';
import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import type { PdfOcr } from '../cvWorkshop/ocr.js';
import { readCv } from '../cvWorkshop/reading.js';
import { decodeCvUpload } from '../cvWorkshop/upload.js';
import * as repository from './repository.js';
import { CV_TYPES_MAX, type CvTypeView, type ImportCvTypeBody, type ReplaceCvTypeBody } from './schemas.js';

const CV_TYPE_NOT_FOUND = 'Ce CV type est introuvable.';
const TOO_MANY = `Vous avez déjà ${String(CV_TYPES_MAX)} CV types : supprimez-en un pour en importer un autre.`;

/** EF-CVX-43: steps published while a CV type is read, for the screen to follow. */
const STEP_READ = 1;

export interface CvTypesService {
  /** @req EF-CVX-39 */
  list: (userId: number) => Promise<{ items: CvTypeView[]; maxItems: number }>;
  /**
   * Checks the file and the room left, then queues its reading and hands back the run at once (EF-CVX-43). Nothing of
   * the CV is written anywhere: only the label and what is worked out from it (ENF-RGP-14).
   * @throws HttpError 413 beyond 5 MB, 400 when it is not a PDF, 409 when the candidate holds 4 CV types already.
   * @returns the identifier of the execution, to follow it (EF-EXE-03).
   * @req EF-CVX-39, EF-CVX-40, EF-CVX-43
   */
  startImport: (userId: number, body: ImportCvTypeBody) => Promise<number>;
  /**
   * Same for the new file of a CV type; the old one stays as it is until the new one is read (EF-CVX-41).
   * @throws NotFoundError when the CV type is not the candidate's.
   * @req EF-CVX-41
   */
  startReplacement: (userId: number, id: number, body: ReplaceCvTypeBody) => Promise<number>;
  /** @throws NotFoundError when the CV type is not the candidate's. @req EF-CVX-42 */
  remove: (userId: number, id: number) => Promise<void>;
}

export interface CvTypesServiceDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  ocr: PdfOcr;
}

/** The reading shared by an import and a replacement: the controls of the CV workshop, nothing sent to a model. */
const readCvType = async (
  { ocr }: Pick<CvTypesServiceDeps, 'ocr'>,
  pdf: Buffer,
  report: (counters: RunCounters) => void,
): Promise<RunCounters> => {
  const reading = await readCv(pdf, { ocr });
  report({ cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount });
  return { cv_steps_done: STEP_READ, cv_pages_ocr: reading.ocrPageCount };
};

const viewOf = (row: repository.CvTypeRow): CvTypeView => ({
  id: row.id,
  label: row.label,
  years: row.years,
  level: row.level,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * The run of an import: the file is read first, so that a CV that cannot be read costs the candidate none of their four
 * places. The count is checked again when the label is kept (EF-CVX-39).
 */
const importRun =
  (deps: CvTypesServiceDeps, { userId, label, pdf }: { userId: number; label: string; pdf: Buffer }) =>
  async (report: (counters: RunCounters) => void): Promise<RunCounters> => {
    const counters = await readCvType(deps, pdf, report);
    const row = await repository.insertCvType(deps.db, {
      userId,
      label,
      now: deps.clock(),
      max: CV_TYPES_MAX,
    });
    if (!row) throw new HttpError(409, TOO_MANY);
    return counters;
  };

/**
 * The run of a replacement: the old profile goes only once the new file is read, so that an unreadable file leaves the
 * CV type as it was (EF-CVX-41).
 */
const replacementRun =
  (deps: CvTypesServiceDeps, { userId, id, pdf }: { userId: number; id: number; pdf: Buffer }) =>
  async (report: (counters: RunCounters) => void): Promise<RunCounters> => {
    const counters = await readCvType(deps, pdf, report);
    if (!(await repository.resetCvType(deps.db, { userId, id, now: deps.clock() }))) {
      throw new NotFoundError(CV_TYPE_NOT_FOUND);
    }
    return counters;
  };

/**
 * EF-CVX-39 to EF-CVX-43: the CV types of a candidate — at most four, each read in the queue with the controls of the
 * CV workshop (format, size, OCR, locked or damaged file) before anything is kept of it.
 */
export const createCvTypesService = (deps: CvTypesServiceDeps): CvTypesService => {
  const { db, queue } = deps;
  /** Imports asked for and not over yet, per candidate: they count against the four places as soon as asked. */
  const pendingImports = new Map<number, number>();
  const pendingOf = (userId: number): number => pendingImports.get(userId) ?? 0;
  const addPending = (userId: number, delta: number): void => {
    pendingImports.set(userId, Math.max(0, pendingOf(userId) + delta));
  };

  return {
    async list(userId) {
      return { items: (await repository.listCvTypes(db, userId)).map(viewOf), maxItems: CV_TYPES_MAX };
    },

    async startImport(userId, { label, file }) {
      const pdf = decodeCvUpload(file);
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
      return queue.enqueue({
        userId,
        job: 'profile_deduction',
        trigger: 'manual',
        run: replacementRun(deps, { userId, id, pdf }),
      });
    },

    async remove(userId, id) {
      if (!(await repository.deleteCvType(db, userId, id))) throw new NotFoundError(CV_TYPE_NOT_FOUND);
    },
  };
};
