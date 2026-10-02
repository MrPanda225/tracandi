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
import type { SirenFinder } from '../../scraper/official/companySearch.js';
import type { FranceTravailApi } from '../../scraper/official/franceTravail.js';
import type { LaBonneAlternanceApi } from '../../scraper/official/laBonneAlternance.js';
import { ensureCompany } from '../applications/service.js';
import type { ScoringProfile } from '../../llm/prompts/scoreOffers.js';
import type { ProfileService } from '../cv/service.js';
import type { WatchCriteria } from '../criteria/schemas.js';
import { type CriteriaService, scoringProfileOf } from '../criteria/service.js';
import { createWatchPass, type WatchPassDeps } from './pass.js';
import { createSourceDiscovery, type SourceDiscovery } from './discovery.js';
import { createSirenResolver } from './sirens.js';
import { createSuggestionReader } from './suggestions.js';
import * as repository from './repository.js';
import type { SourceRow } from './repository.js';
import type { CreateSourceBody, SourceSuggestion, SourceView, WatchReport } from './schemas.js';

const SOURCE_NOT_FOUND = 'Source surveillée introuvable';
const ALREADY_WATCHED = 'Cette source est déjà surveillée pour cette entreprise';
const NO_CRITERIA =
  'Renseignez vos critères de recherche avant de lancer la veille : vos cibles servent à noter les offres.';
const CONFLICT = 409;
const BAD_REQUEST = 400;
/** ENF-RGP-10 (v1.33): an offer neither kept nor applied to is removed 60 days after its source stopped publishing it. */
const OFFER_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
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
  /** @req EF-VEI-23, EF-VEI-24 */
  suggestions: (userId: number) => Promise<SourceSuggestion[]>;
  /** @req EF-VEI-25 */
  dismissSuggestion: (userId: number, companyId: number) => Promise<void>;
  /**
   * Puts the search of the career pages of the proposed companies in the queue (EF-EXE-01).
   * @returns the identifier of the execution, to follow it (EF-EXE-03).
   * @req EF-VEI-38, EF-VEI-40
   */
  discoverSources: (userId: number) => Promise<number>;
}

export interface WatchServiceDeps {
  db: Database;
  clock: Clock;
  /** EF-VEI-29: what the candidate looks for. */
  criteria: CriteriaService;
  /** EF-VEI-31: the reference profile, read only when the candidate has no criteria yet. */
  profiles: ProfileService;
  router: LlmRouter;
  queue: JobQueue;
  /** The responsible collector of T-401, shared by every adapter (rules/scraping.md). */
  collect: AdapterDeps['fetch'];
  /** EF-VEI-36: the search of a company's SIREN; null to do without it. */
  findSiren: SirenFinder | null;
  /** EF-VEI-32, EF-VEI-37: the clients of the official APIs; null when the server has no credentials for one. */
  officialApis: { franceTravail: FranceTravailApi | null; laBonneAlternance: LaBonneAlternanceApi | null };
  logger: Logger;
  /** EF-EXE-07, ENF-PERF-09: what one pass may do for one candidate. */
  limits?: WatchPassDeps['limits'];
}

/** What a pass reports when the candidate watches no active source (EF-VEI-07). */
const EMPTY_REPORT = (threshold: number): WatchReport => ({
  sourcesChecked: 0,
  sourcesFailed: 0,
  offersFound: 0,
  offersNew: 0,
  offersRelevant: 0,
  offersUnscored: 0,
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
const createSourceCatalogue = (db: Database, deps: { criteria: CriteriaService }) => {
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
      const adapter = adapterFor(body.adapter);
      // EF-VEI-32: an official source has no company; the schema already required one for every other type.
      const companyId =
        adapter.isOfficial || body.companyName === undefined
          ? null
          : await ensureCompany(db, { userId, name: body.companyName });
      const identifier = adapter.identifierSchema.parse(body.identifier);
      // EF-VEI-34: a source the criteria cannot feed is refused now, not at its first check.
      const refusal = adapter.refusalFor?.(await deps.criteria.read(userId)) ?? null;
      if (refusal !== null) throw new HttpError(BAD_REQUEST, refusal);
      try {
        const id = await repository.insertSource(db, {
          userId,
          companyId,
          adapter: body.adapter,
          identifier,
        });
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

/** EF-VEI-40: the search of the career pages, as the queue runs it. */
const discoveryWorkFor = (discovery: SourceDiscovery, userId: number) => ({
  userId,
  job: 'source_discovery' as const,
  trigger: 'manual' as const,
  run: (report: (counters: RunCounters) => void) => discovery.run(userId, report),
});

const thresholdOf = async (db: Database, userId: number): Promise<number> => {
  const [row] = await db
    .select({ threshold: appSettings.offerAlertThreshold })
    .from(appSettings)
    .where(eq(appSettings.userId, userId));
  return row?.threshold ?? DEFAULT_THRESHOLD;
};

/**
 * EF-VEI-31: the criteria of the candidate, or the targets of the reference profile while they have none.
 * @throws HttpError 409 when there is neither: the targets are what a score is measured against (RG-09).
 */
const scoringOf = async (
  profiles: WatchServiceDeps['profiles'],
  userId: number,
  saved: WatchCriteria | null,
): Promise<ScoringProfile> => {
  if (saved) return scoringProfileOf(saved);
  const profile = await profiles.read(userId).catch(() => {
    throw new HttpError(CONFLICT, NO_CRITERIA);
  });
  return { searchArea: profile.location.searchArea, targets: profile.targets };
};

const countersOf = (report: WatchReport): RunCounters => ({
  sources_checked: report.sourcesChecked,
  offers_new: report.offersNew,
  offers_relevant: report.offersRelevant,
  offers_unscored: report.offersUnscored,
});

/**
 * Watch of the career sources of a candidate: the sources themselves, and the pass that reads them all.
 * @req EF-VEI-01 to EF-VEI-07, EF-AUT-06
 */
export const createWatchService = (deps: WatchServiceDeps): WatchService => {
  const { db, criteria, profiles, queue, logger } = deps;
  const catalogue = createSourceCatalogue(db, { criteria });
  const pass = createWatchPass(deps);
  const suggestions = createSuggestionReader(db);
  const discovery = createSourceDiscovery({
    db,
    clock: deps.clock,
    collect: deps.collect,
    suggestions,
    logger,
  });
  const sirens = deps.findSiren
    ? createSirenResolver({ db, clock: deps.clock, findSiren: deps.findSiren, logger })
    : null;

  /**
   * Nothing is collected before the targets are known. A candidate who watches nothing is simply told so, rather
   * than asked for criteria they do not need yet.
   */
  const runPass = async (userId: number, trigger: 'manual' | 'schedule'): Promise<WatchReport> => {
    const threshold = await thresholdOf(db, userId);
    // EF-VEI-42: a scheduled pass leaves the sources not due yet; the candidate's own request reads them all.
    const sources = await repository.listActiveSources(
      db,
      userId,
      trigger === 'schedule' ? deps.clock() : null,
    );
    if (sources.length === 0) return EMPTY_REPORT(threshold);
    const saved = await criteria.read(userId);
    await sirens?.resolve(userId);
    return pass.run({
      userId,
      scoring: await scoringOf(profiles, userId, saved),
      criteria: saved,
      sources,
      threshold,
      // EF-IA-08, EF-IA-09: the pass of the clock is led by the local model, the one the candidate asked for is not.
      mode: trigger === 'schedule' ? 'scheduled' : 'attended',
    });
  };

  const workFor = (userId: number, trigger: 'manual' | 'schedule') => ({
    userId,
    job: 'scraper' as const,
    trigger,
    run: async () => countersOf(await runPass(userId, trigger)),
  });

  return {
    ...catalogue,

    checkNow: (userId) => queue.enqueue(workFor(userId, 'manual')),

    suggestions: (userId) => suggestions.list(userId),

    dismissSuggestion: (userId, companyId) => suggestions.dismiss(userId, companyId),

    discoverSources: (userId) => queue.enqueue(discoveryWorkFor(discovery, userId)),

    async checkEverySource() {
      // ENF-RGP-10: three times a day, so at least once a day.
      const removed = await repository.purgeStaleOffers(
        db,
        new Date(deps.clock().getTime() - OFFER_RETENTION_MS),
      );
      if (removed > 0) logger.info('stale offers removed', { removed });
      for (const userId of await repository.listUsersWithActiveSources(db)) {
        // EF-GML-18: a candidate who already has a pass waiting or running is written off, not queued twice.
        const runId = await queue.enqueueUnlessPending(workFor(userId, 'schedule'));
        if (runId === null) logger.info('scheduled watch skipped, one is already queued', { userId });
      }
    },
  };
};
