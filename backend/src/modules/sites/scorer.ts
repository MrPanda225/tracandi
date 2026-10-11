import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import { HOSTED_BATCH_LIMITS } from '../../llm/limits.js';
import { buildScoreOffersPrompt, type ScoringProfile } from '../../llm/prompts/scoreOffers.js';
import type { LlmRouter } from '../../llm/router.js';
import { scoredOffersSchemaFor } from '../offers/scoring.js';
import * as repository from './repository.js';
import type { UnscoredOffer } from './repository.js';

/** EF-EXE-07 (v1.35): offers scored by one pass for one candidate, unless the configuration says otherwise. */
export const DEFAULT_MAX_SCORED_OFFERS = 20;
/** ENF-PERF-09 (v1.35): a pass stops, cleanly, after this long. */
export const MAX_PASS_MINUTES = 45;
/** What a pass reads at most of the waiting offers when the ceiling is lifted. */
const MAX_OFFERS_READ = 1_000;
const MS_PER_MINUTE = 60_000;

/** What the scoring of the waiting offers did, as the report counts it. */
export interface ScoringOutcome {
  scored: number;
  /** Offers scored at or above the threshold of EF-VEI-15. */
  relevant: number;
  /** Offers of the candidate still without a score after this pass (EF-VEI-54). */
  waiting: number;
}

export interface PendingScoringInput {
  /** The router of this pass: its routes by mode and its own count of connection failures (EF-IA-14). */
  llm: LlmRouter;
  userId: number;
  scoring: ScoringProfile;
  threshold: number;
  /** When the pass began: the offers it found itself come after the ones that waited (RG-31). */
  startedAt: Date;
  /** After this instant no batch is started (ENF-PERF-09). */
  deadline: Date;
  /** EF-EXE-07: offers scored at most; 0 lifts the limit. */
  maxOffers: number;
}

interface Deps {
  db: Database;
  clock: Clock;
  logger: Logger;
}

/**
 * RG-09: scores one batch through the AI, by reference. An offer the model leaves out is not given a score: it stays
 * without one and is sent again at the next pass (EF-VEI-54). A model that scores none of the batch is refused by the
 * schema, so that the router asks the next provider.
 */
const scoreBatch = async (
  input: PendingScoringInput,
  batch: readonly UnscoredOffer[],
  descriptionChars: number,
): Promise<{ id: number; score: number; reason: string | null }[]> => {
  const offers = batch.map((offer, index) => ({ ...offer, ref: index + 1 }));
  const { data } = await input.llm.runTask('score_offers', {
    userId: input.userId,
    ...buildScoreOffersPrompt(input.scoring, offers, { descriptionChars }),
    schema: scoredOffersSchemaFor(batch.length),
  });
  const byReference = new Map(data.offers.map((scored) => [scored.ref, scored]));
  return batch.flatMap((offer, index) => {
    const scored = byReference.get(index + 1);
    return scored ? [{ id: offer.id, score: scored.score, reason: scored.reason }] : [];
  });
};

/**
 * EF-VEI-54, EF-EXE-07, ENF-PERF-09, RG-31: scores the offers of the candidate that wait for a score — those that
 * waited from a previous pass first, then the most recently published — in the batches the first provider of the
 * route can take, up to the ceiling of the pass and before its deadline. A model that does not answer never costs
 * an offer: the batch is left waiting and the pass goes on to its end (ENF-FIA-11).
 * @req EF-VEI-54, EF-EXE-07, ENF-PERF-09, RG-31, ENF-FIA-11
 */
export const scorePendingOffers = async (
  { db, clock, logger }: Deps,
  input: PendingScoringInput,
): Promise<ScoringOutcome> => {
  const limit = input.maxOffers > 0 ? input.maxOffers : MAX_OFFERS_READ;
  const queue = await repository.listUnscoredOffers(db, input.userId, {
    passStartedAt: input.startedAt,
    limit,
  });
  let scored = 0;
  let relevant = 0;
  while (queue.length > 0 && clock().getTime() < input.deadline.getTime()) {
    // The limits are read before each batch: a local model that went off in the middle hands over to the hosted ones.
    const limits = input.llm.limitsFor?.('score_offers') ?? HOSTED_BATCH_LIMITS;
    const batch = queue.splice(0, limits.batchSize);
    try {
      const results = await scoreBatch(input, batch, limits.descriptionChars);
      await repository.setScores(db, results);
      scored += results.length;
      relevant += results.filter((result) => result.score >= input.threshold).length;
    } catch (error) {
      logger.warn('scoring left waiting: no provider answered', { userId: input.userId, error });
      break;
    }
  }
  return { scored, relevant, waiting: await repository.countUnscoredOffers(db, input.userId) };
};

/** The instant after which a pass that began at `startedAt` starts nothing more (ENF-PERF-09). */
export const deadlineOf = (startedAt: Date, maxMinutes = MAX_PASS_MINUTES): Date =>
  new Date(startedAt.getTime() + maxMinutes * MS_PER_MINUTE);
