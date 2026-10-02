import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import type { ScoringProfile } from '../../llm/prompts/scoreOffers.js';
import type { LlmRouter, RunMode } from '../../llm/router.js';
import { adapterFor } from '../../scraper/adapters/index.js';
import { describeCollectionFailure } from '../../scraper/failures.js';
import type { AdapterDeps, NormalizedOffer } from '../../scraper/adapters/types.js';
import type { FranceTravailApi } from '../../scraper/official/franceTravail.js';
import type { LaBonneAlternanceApi } from '../../scraper/official/laBonneAlternance.js';
import type { WatchCriteria } from '../criteria/schemas.js';
import { isWorthScoring, matchedTargetOf, PREFILTERED_REASON, PREFILTERED_SCORE } from '../offers/scoring.js';
import { fingerprintOf, type Pace, paceAfter } from './pacing.js';
import * as repository from './repository.js';
import type { OfferToStore, SourceRow } from './repository.js';
import type { WatchReport } from './schemas.js';
import { DEFAULT_MAX_SCORED_OFFERS, deadlineOf, scorePendingOffers } from './scorer.js';

export interface WatchPassDeps {
  db: Database;
  clock: Clock;
  router: LlmRouter;
  /** The responsible collector of T-401, shared by every adapter (rules/scraping.md). */
  collect: AdapterDeps['fetch'];
  /** EF-VEI-32, EF-VEI-37: the clients of the official APIs; null when the server has no credentials for one. */
  officialApis: { franceTravail: FranceTravailApi | null; laBonneAlternance: LaBonneAlternanceApi | null };
  logger: Logger;
  /** EF-EXE-07, ENF-PERF-09: what one pass may do for one candidate; the defaults of the cahier des charges. */
  limits?: { maxScoredOffersPerPass?: number; maxPassMinutes?: number } | undefined;
}

/** What one pass needs to know about the candidate it runs for. */
export interface PassContext {
  userId: number;
  /** What every new offer is scored against: the search criteria, or the reference profile at worst (EF-VEI-31). */
  scoring: ScoringProfile;
  /** EF-VEI-32: what the official sources are queried with; null while the candidate has saved none. */
  criteria: WatchCriteria | null;
  /** The active sources to read, chosen by the caller (EF-VEI-04). */
  sources: readonly SourceRow[];
  /** EF-VEI-15: score S at or above which an offer counts as relevant. */
  threshold: number;
  /**
   * EF-IA-08, EF-IA-09: `scheduled` for the pass of 7, 13 and 19 o'clock, which the local model leads; `attended` (the
   * default) for the pass the candidate asked for, which the hosted providers lead.
   */
  mode?: RunMode;
}

export interface WatchPass {
  /**
   * Reads every active source of the candidate, stores the offers they do not have yet and scores them.
   * A source that fails keeps its failure and never stops the others (ENF-FIA-02).
   * @req EF-VEI-07, EF-VEI-09 to EF-VEI-14, EF-VEI-21
   */
  run: (context: PassContext) => Promise<WatchReport>;
}

/** What one source produced, as the report counts it. */
interface SourceOutcome {
  found: number;
  added: number;
  /** EF-VEI-42: when the scheduled pass should read the source again. */
  pace: Pace;
}

const emptyReport = (threshold: number): WatchReport => ({
  sourcesChecked: 0,
  sourcesFailed: 0,
  offersFound: 0,
  offersNew: 0,
  offersRelevant: 0,
  offersUnscored: 0,
  threshold,
});

/**
 * EF-VEI-12, EF-VEI-14, EF-VEI-54: what a new offer is stored with. RG-10 sets aside what carries no keyword of a
 * target, which costs no AI call at all; the others are stored without a score and scored at the end of the pass, or
 * at the next one when no model answers (ENF-FIA-11).
 */
const storableOf = (offer: NormalizedOffer, targets: ScoringProfile['targets']): OfferToStore => {
  const isWorth = isWorthScoring(offer, targets);
  return {
    ...offer,
    relevanceScore: isWorth ? null : PREFILTERED_SCORE,
    relevanceReason: isWorth ? null : PREFILTERED_REASON,
    matchedTarget: matchedTargetOf(offer, targets),
  };
};

/**
 * EF-VEI-41, EF-VEI-42, ENF-RGP-10: what a check tells beyond the new offers — the pace of the source, and that the
 * offers already known and found again are still published.
 */
const noteWhatIsStillPublished = async (
  db: Database,
  {
    source,
    found,
    known,
    checkedAt,
  }: { source: SourceRow; found: readonly NormalizedOffer[]; known: ReadonlySet<string>; checkedAt: Date },
): Promise<Pace> => {
  const ids = found.map((offer) => offer.externalId);
  await repository.touchOffers(db, source.id, {
    externalIds: ids.filter((id) => known.has(id)),
    seenAt: checkedAt,
  });
  return paceAfter(
    { fingerprint: source.offersFingerprint, unchangedChecks: source.unchangedChecks },
    { fingerprint: fingerprintOf(ids), checkedAt },
  );
};

/** One pass: its router (routes of its mode, its own failures). */
interface PassWork {
  llm: LlmRouter;
}

/** One source: read, kept apart from what is already known (EF-VEI-09), scored, then stored. */
const createSourceChecker =
  ({ db, clock, collect, officialApis }: WatchPassDeps) =>
  async (context: PassContext, source: SourceRow, work: PassWork): Promise<SourceOutcome> => {
    const found = await adapterFor(source.adapter).fetchOffers(source.identifier, {
      fetch: collect,
      runTask: (task, input) => work.llm.runTask(task, { ...input, userId: context.userId }),
      official: {
        criteria: context.criteria,
        // RG-30: from the start of the last SUCCESSFUL check, so that a failed one never leaves a gap (EF-VEI-53).
        since: source.lastSuccessStartedAt,
        now: clock(),
        franceTravail: officialApis.franceTravail,
        laBonneAlternance: officialApis.laBonneAlternance,
      },
    });
    const known = await repository.listKnownOfferIds(db, source.id);
    const checkedAt = clock();
    const pace = await noteWhatIsStillPublished(db, { source, found, known, checkedAt });
    const fresh = found.filter((offer) => !known.has(offer.externalId));
    if (fresh.length === 0) return { found: found.length, added: 0, pace };

    const stored = fresh.map((offer) => storableOf(offer, context.scoring.targets));
    return {
      found: found.length,
      added: await repository.insertOffers(db, source.id, { offers: stored, seenAt: checkedAt }),
      pace,
    };
  };

export const createWatchPass = (deps: WatchPassDeps): WatchPass => {
  const { db, clock, router, logger, limits } = deps;
  const checkSource = createSourceChecker(deps);

  /** One source, read and its offers stored; a failure stays on the source (ENF-FIA-02). */
  const readSource = async (work: {
    context: PassContext;
    source: SourceRow;
    llm: LlmRouter;
    report: WatchReport;
  }) => {
    const { context, source, llm, report } = work;
    // The window of the next check starts where this one began: what is published while it reads is not missed.
    const startedAt = clock();
    try {
      const outcome = await checkSource(context, source, { llm });
      report.sourcesChecked += 1;
      report.offersFound += outcome.found;
      report.offersNew += outcome.added;
      await repository.recordCheck(db, source.id, {
        checkedAt: clock(),
        error: null,
        pace: outcome.pace,
        succeededFrom: startedAt,
      });
    } catch (error) {
      report.sourcesFailed += 1;
      logger.warn('watched source failed', { sourceId: source.id, adapter: source.adapter, error });
      await repository.recordCheck(db, source.id, {
        checkedAt: clock(),
        error: describeCollectionFailure(error),
      });
    }
  };

  return {
    async run(context) {
      const report = emptyReport(context.threshold);
      const startedAt = clock();
      const deadline = deadlineOf(startedAt, limits?.maxPassMinutes);
      // EF-IA-08, EF-IA-14: one router for the whole pass, with the routes of its mode and its own count of failures.
      const llm = router.forMode?.(context.mode ?? 'attended') ?? router;
      // Sources are read one after the other: the collector already spaces its calls, and a career page costs an
      // AI call. A pass that ran out of time reads no further source: its window picks the rest up (EF-VEI-53).
      for (const source of context.sources) {
        if (clock().getTime() >= deadline.getTime()) break;
        await readSource({ context, source, llm, report });
      }
      // EF-VEI-54: every offer read is stored; the scoring comes after, and never costs an offer.
      const scoring = await scorePendingOffers(
        { db, clock, logger },
        {
          llm,
          userId: context.userId,
          scoring: context.scoring,
          threshold: context.threshold,
          startedAt,
          deadline,
          maxOffers: limits?.maxScoredOffersPerPass ?? DEFAULT_MAX_SCORED_OFFERS,
        },
      );
      report.offersRelevant = scoring.relevant;
      report.offersUnscored = scoring.waiting;
      return report;
    },
  };
};
