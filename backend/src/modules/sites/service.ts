import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { appSettings } from '../../db/schema.js';
import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { LlmRouter } from '../../llm/router.js';
import { adapterFor } from '../../scraper/adapters/index.js';
import type { AdapterDeps } from '../../scraper/adapters/types.js';
import { ensureCompany } from '../applications/service.js';
import type { ProfileService } from '../cv/service.js';
import { createWatchPass } from './pass.js';
import * as repository from './repository.js';
import type { SourceRow } from './repository.js';
import type { CreateSourceBody, SourceView, WatchReport } from './schemas.js';

const SOURCE_NOT_FOUND = 'Source surveillée introuvable';
const ALREADY_WATCHED = 'Cette source est déjà surveillée pour cette entreprise';
const NO_PROFILE =
  'Renseignez votre profil de référence avant de lancer la veille : vos cibles servent à noter les offres.';
const CONFLICT = 409;
/** EF-VEI-15: default threshold S, used while the candidate has no settings row. */
const DEFAULT_THRESHOLD = 60;

export interface WatchService {
  /** @req EF-VEI-01, EF-AUT-06 */
  list: (userId: number) => Promise<SourceView[]>;
  /** @req EF-VEI-01, EF-VEI-02, EF-VEI-03 */
  add: (userId: number, body: CreateSourceBody) => Promise<SourceView>;
  /** @req EF-VEI-04 */
  setActive: (userId: number, id: number, isActive: boolean) => Promise<SourceView>;
  /** @req EF-VEI-05 */
  remove: (userId: number, id: number) => Promise<void>;
  /**
   * Puts one pass in the queue of the candidate and hands back at once (EF-EXE-01): reading a dozen sources and
   * scoring what they publish takes far longer than a request may.
   * @returns the identifier of the execution, to follow it (EF-EXE-03).
   * @req EF-VEI-07, EF-EXE-01
   */
  checkNow: (userId: number) => Promise<number>;
  /** @req EF-VEI-06, ENF-FIA-02 */
  checkEverySource: () => Promise<void>;
}

export interface WatchServiceDeps {
  db: Database;
  clock: Clock;
  profiles: ProfileService;
  router: LlmRouter;
  queue: JobQueue;
  /** The responsible collector of T-401, shared by every adapter (rules/scraping.md). */
  collect: AdapterDeps['fetch'];
  logger: Logger;
}

/** What a pass reports when the candidate watches no active source (EF-VEI-07). */
const EMPTY_REPORT = (threshold: number): WatchReport => ({
  sourcesChecked: 0,
  sourcesFailed: 0,
  offersFound: 0,
  offersNew: 0,
  offersRelevant: 0,
  threshold,
});

const viewOf = (row: SourceRow): SourceView => ({
  id: row.id,
  companyName: row.companyName,
  adapter: row.adapter,
  adapterLabel: adapterFor(row.adapter).label,
  identifier: row.identifier,
  isActive: row.isActive,
  lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  lastError: row.lastError,
  offerCount: row.offerCount,
});

/** EF-VEI-01 to EF-VEI-05: the sources themselves, apart from the pass that reads them. */
const createSourceCatalogue = (db: Database) => {
  const readOwned = async (userId: number, id: number): Promise<SourceRow> => {
    const row = await repository.findSource(db, userId, id);
    if (!row) throw new NotFoundError(SOURCE_NOT_FOUND);
    return row;
  };

  return {
    async list(userId: number): Promise<SourceView[]> {
      return (await repository.listSources(db, userId)).map(viewOf);
    },

    async add(userId: number, body: CreateSourceBody): Promise<SourceView> {
      const companyId = await ensureCompany(db, { userId, name: body.companyName });
      const identifier = adapterFor(body.adapter).identifierSchema.parse(body.identifier);
      try {
        const id = await repository.insertSource(db, { companyId, adapter: body.adapter, identifier });
        return viewOf(await readOwned(userId, id));
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(CONFLICT, ALREADY_WATCHED);
        throw error;
      }
    },

    async setActive(userId: number, id: number, isActive: boolean): Promise<SourceView> {
      await readOwned(userId, id);
      await repository.setSourceActive(db, { userId, id, isActive });
      return viewOf(await readOwned(userId, id));
    },

    async remove(userId: number, id: number): Promise<void> {
      await readOwned(userId, id);
      await repository.deleteSource(db, userId, id);
    },
  };
};

/**
 * Watch of the career sources of a candidate: the sources themselves, and the pass that reads them all.
 * @req EF-VEI-01 to EF-VEI-07, EF-AUT-06
 */
export const createWatchService = (deps: WatchServiceDeps): WatchService => {
  const { db, profiles, queue, logger } = deps;
  const catalogue = createSourceCatalogue(db);
  const pass = createWatchPass(deps);

  const thresholdOf = async (userId: number): Promise<number> => {
    const [row] = await db
      .select({ threshold: appSettings.offerAlertThreshold })
      .from(appSettings)
      .where(eq(appSettings.userId, userId));
    return row?.threshold ?? DEFAULT_THRESHOLD;
  };

  /**
   * Nothing is collected before the targets are known: they are what a score is measured against (RG-09). A
   * candidate who watches nothing is simply told so, rather than asked for a profile they do not need yet.
   */
  const runPass = async (userId: number): Promise<WatchReport> => {
    const threshold = await thresholdOf(userId);
    const sources = await repository.listActiveSources(db, userId);
    if (sources.length === 0) return EMPTY_REPORT(threshold);
    const profile = await profiles.read(userId).catch(() => {
      throw new HttpError(CONFLICT, NO_PROFILE);
    });
    return pass.run({ userId, profile, sources, threshold });
  };

  const countersOf = (report: WatchReport): RunCounters => ({
    sources_checked: report.sourcesChecked,
    offers_new: report.offersNew,
    offers_relevant: report.offersRelevant,
  });

  const workFor = (userId: number, trigger: 'manual' | 'schedule') => ({
    userId,
    job: 'scraper' as const,
    trigger,
    run: async () => countersOf(await runPass(userId)),
  });

  return {
    ...catalogue,

    checkNow: (userId) => queue.enqueue(workFor(userId, 'manual')),

    async checkEverySource() {
      for (const userId of await repository.listUsersWithActiveSources(db)) {
        // EF-GML-18: a candidate who already has a pass waiting or running is written off, not queued twice.
        const runId = await queue.enqueueUnlessPending(workFor(userId, 'schedule'));
        if (runId === null) logger.info('scheduled watch skipped, one is already queued', { userId });
      }
    },
  };
};
