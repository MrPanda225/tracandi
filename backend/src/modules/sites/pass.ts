import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import { buildScoreOffersPrompt, type OfferToScore } from '../../llm/prompts/scoreOffers.js';
import type { LlmRouter } from '../../llm/router.js';
import { adapterFor } from '../../scraper/adapters/index.js';
import type { AdapterDeps, NormalizedOffer } from '../../scraper/adapters/types.js';
import type { CandidateProfile } from '../cv/schemas.js';
import {
  isWorthScoring,
  matchedTargetOf,
  PREFILTERED_REASON,
  PREFILTERED_SCORE,
  SCORING_BATCH_SIZE,
  ScoredOffersSchema,
  type ScoringTarget,
} from '../offers/scoring.js';
import * as repository from './repository.js';
import type { OfferToStore, SourceRow } from './repository.js';
import type { WatchReport } from './schemas.js';

/** Same bound as `watched_sites.last_error`. */
const ERROR_MAX_LENGTH = 500;

export interface WatchPassDeps {
  db: Database;
  clock: Clock;
  router: LlmRouter;
  /** The responsible collector of T-401, shared by every adapter (rules/scraping.md). */
  collect: AdapterDeps['fetch'];
  logger: Logger;
}

/** What one pass needs to know about the candidate it runs for. */
export interface PassContext {
  userId: number;
  profile: CandidateProfile;
  /** The active sources to read, chosen by the caller (EF-VEI-04). */
  sources: readonly SourceRow[];
  /** EF-VEI-15: score S at or above which an offer counts as relevant. */
  threshold: number;
}

export interface WatchPass {
  /**
   * Reads every active source of the candidate, stores the offers they do not have yet and scores them.
   * A source that fails keeps its failure and never stops the others (ENF-FIA-02).
   * @req EF-VEI-07, EF-VEI-09 to EF-VEI-14, EF-VEI-21
   */
  run: (context: PassContext) => Promise<WatchReport>;
}

/** The message stored on a source that failed, bounded and readable; never a stack (ENF-SEC-08, EF-VEI-11). */
const describeFailure = (error: unknown): string =>
  (error instanceof Error ? error.message : 'Échec inconnu de la consultation').slice(0, ERROR_MAX_LENGTH);

const targetsOf = (profile: CandidateProfile): ScoringTarget[] =>
  profile.targets.map((target) => ({
    label: target.label,
    contractTypes: target.contractTypes,
    keywords: target.keywords,
  }));

const batches = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
};

interface Score {
  score: number;
  reason: string | null;
}

/** What one source produced, as the report counts it. */
interface SourceOutcome {
  found: number;
  added: number;
  relevant: number;
}

const emptyReport = (threshold: number): WatchReport => ({
  sourcesChecked: 0,
  sourcesFailed: 0,
  offersFound: 0,
  offersNew: 0,
  offersRelevant: 0,
  threshold,
});

interface ScorerDeps {
  router: LlmRouter;
}

/**
 * EF-VEI-12 to EF-VEI-14: gives every new offer a score. RG-10 sets aside what carries no keyword of a target,
 * which costs no AI call at all; the rest is scored fifteen at a time (ENF-COU-01).
 */
const createScorer = ({ router }: ScorerDeps) => {
  /**
   * RG-09: scores one batch through the AI, by reference. A model that skips an offer leaves it unscored; the
   * caller then falls back rather than losing the offer (ENF-FIA-02).
   */
  const scoreBatch = async (
    context: PassContext,
    offers: readonly OfferToScore[],
  ): Promise<Map<number, Score>> => {
    const { data } = await router.runTask('score_offers', {
      userId: context.userId,
      ...buildScoreOffersPrompt(
        { searchArea: context.profile.location.searchArea, targets: targetsOf(context.profile) },
        offers,
      ),
      schema: ScoredOffersSchema,
    });
    return new Map(data.offers.map((scored) => [scored.ref, { score: scored.score, reason: scored.reason }]));
  };

  return async (context: PassContext, offers: readonly NormalizedOffer[]): Promise<OfferToStore[]> => {
    const targets = targetsOf(context.profile);
    const worth = offers.filter((offer) => isWorthScoring(offer, targets));
    const referenceOf = new Map(worth.map((offer, index) => [offer, index + 1]));
    const scores = new Map<number, Score>();

    for (const batch of batches(worth, SCORING_BATCH_SIZE)) {
      const scored = await scoreBatch(
        context,
        batch.map((offer) => ({ ...offer, ref: referenceOf.get(offer) ?? 0 })),
      );
      for (const [reference, value] of scored) scores.set(reference, value);
    }

    return offers.map((offer) => {
      const reference = referenceOf.get(offer);
      const scored = reference === undefined ? undefined : scores.get(reference);
      return {
        ...offer,
        // An offer RG-10 set aside, and one the model skipped, both stay at the bottom rather than being lost.
        relevanceScore: scored?.score ?? PREFILTERED_SCORE,
        relevanceReason: reference === undefined ? PREFILTERED_REASON : (scored?.reason ?? null),
        matchedTarget: matchedTargetOf(offer, targets),
      };
    });
  };
};

export const createWatchPass = ({ db, clock, router, collect, logger }: WatchPassDeps): WatchPass => {
  const scoreOffers = createScorer({ router });

  /** One source: read, kept apart from what is already known (EF-VEI-09), scored, then stored. */
  const checkSource = async (context: PassContext, source: SourceRow): Promise<SourceOutcome> => {
    const found = await adapterFor(source.adapter).fetchOffers(source.identifier, {
      fetch: collect,
      runTask: (task, input) => router.runTask(task, { ...input, userId: context.userId }),
    });
    const known = await repository.listKnownOfferIds(db, source.id);
    const fresh = found.filter((offer) => !known.has(offer.externalId));
    if (fresh.length === 0) return { found: found.length, added: 0, relevant: 0 };

    const scored = await scoreOffers(context, fresh);
    return {
      found: found.length,
      added: await repository.insertOffers(db, source.id, scored),
      relevant: scored.filter((offer) => offer.relevanceScore >= context.threshold).length,
    };
  };

  return {
    async run(context) {
      const report = emptyReport(context.threshold);
      // Sources are read one after the other: the collector already spaces its calls, and a career page costs an
      // AI call. What matters is that a failure stays on its own source (ENF-FIA-02).
      for (const source of context.sources) {
        try {
          const outcome = await checkSource(context, source);
          report.sourcesChecked += 1;
          report.offersFound += outcome.found;
          report.offersNew += outcome.added;
          report.offersRelevant += outcome.relevant;
          await repository.recordCheck(db, source.id, { checkedAt: clock(), error: null });
        } catch (error) {
          report.sourcesFailed += 1;
          logger.warn('watched source failed', { sourceId: source.id, adapter: source.adapter, error });
          await repository.recordCheck(db, source.id, { checkedAt: clock(), error: describeFailure(error) });
        }
      }
      return report;
    },
  };
};
