import { z } from 'zod';
import { normalizeKey } from '../../lib/text.js';
import { HOSTED_BATCH_LIMITS } from '../../llm/limits.js';
import type { OfferContractType } from '../../scraper/adapters/types.js';

/**
 * EF-VEI-14: score given without any AI call to an offer RG-10 sets aside. Not zero: the offer stays visible and
 * sortable, it is simply at the bottom of the list.
 */
export const PREFILTERED_SCORE = 5;
/** ENF-COU-01: offers are scored fifteen at a time (rules/llm.md). */
export const SCORING_BATCH_SIZE = HOSTED_BATCH_LIMITS.batchSize;
/** EF-VEI-14: what the candidate reads beside an offer no model ever looked at. */
export const PREFILTERED_REASON = 'Écartée sans appel à l’IA : aucun mot-clé de vos cibles (RG-10).';

const REASON_MAX_LENGTH = 500;
const MIN_SCORE = 0;
const MAX_SCORE = 100;

/** A target of the reference profile, as the scoring reads it (EF-CVX-02, RG-09). */
export interface ScoringTarget {
  label: string;
  contractTypes: readonly string[];
  keywords: readonly string[];
}

/** What RG-10 and RG-09 look at in an offer. */
export interface ScorableOffer {
  title: string;
  description: string | null;
  contractType: OfferContractType;
}

/** A keyword matches a whole word or a whole run of words, whatever the case and the accents (RG-14). */
const holdsKeyword = (text: string, keywordKeys: readonly string[]): boolean => {
  const padded = ` ${normalizeKey(text)} `;
  return keywordKeys.some((key) => padded.includes(` ${key} `));
};

/**
 * RG-10: the first target of the profile a keyword of which appears in the title or the description of the offer,
 * or null when none does. The label is kept on the offer, so the candidate reads why it was scored (EF-VEI-12).
 * @req RG-10, EF-VEI-12
 */
export const matchedTargetOf = (offer: ScorableOffer, targets: readonly ScoringTarget[]): string | null => {
  const text = `${offer.title}\n${offer.description ?? ''}`;
  const matched = targets.find((target) =>
    holdsKeyword(
      text,
      target.keywords.map((keyword) => normalizeKey(keyword)).filter((key) => key !== ''),
    ),
  );
  return matched?.label ?? null;
};

/**
 * RG-10: an offer reaches the AI only when a keyword of a target appears in it **and** its contract is one the
 * candidate looks for. « Autre » — a placement, a volunteering — is not a contract of RG-09; « non précisé » is
 * kept, because a source that states nothing must not cost the candidate an offer.
 * @req RG-10, EF-VEI-14
 */
export const isWorthScoring = (offer: ScorableOffer, targets: readonly ScoringTarget[]): boolean =>
  offer.contractType !== 'autre' && matchedTargetOf(offer, targets) !== null;

/** A whole number a small model wrote as text — « 3 » for 3 — read as the number it says; anything else is left to the schema. */
const wholeNumber = (value: unknown): unknown =>
  typeof value === 'string' && /^\s*-?\d+\s*$/u.test(value) ? Number(value) : value;

/** One offer of a batch, referenced by its position in the prompt (1, 2…). */
export const ScoredOfferSchema = z.object({
  ref: z.preprocess(wholeNumber, z.number().int().positive()),
  score: z.preprocess(wholeNumber, z.number().int().min(MIN_SCORE).max(MAX_SCORE)),
  /** EF-VEI-13: one sentence in French; a model that says nothing gives no reason, not an empty one. */
  reason: z
    .string()
    .trim()
    .max(REASON_MAX_LENGTH)
    .nullish()
    .transform((value) => {
      const kept = (value ?? '').trim();
      return kept === '' ? null : kept.slice(0, REASON_MAX_LENGTH);
    }),
});

/**
 * Output of the `score_offers` task (prompt `llm/prompts/scoreOffers.ts`): the only barrier against an aberrant
 * answer (EF-IA-03). A score outside 0–100 makes the whole batch fail over to the next provider.
 * @req EF-VEI-12, EF-VEI-13, EF-IA-03
 */
export const ScoredOffersSchema = z.object({ offers: z.array(ScoredOfferSchema) });

export type ScoredOffer = z.infer<typeof ScoredOfferSchema>;
export type ScoredOffers = z.infer<typeof ScoredOffersSchema>;
