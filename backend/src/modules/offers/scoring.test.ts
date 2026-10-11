import { describe, expect, it } from 'vitest';
import {
  isWorthScoring,
  matchedTargetOf,
  PREFILTERED_SCORE,
  ScoredOffersSchema,
  scoredOffersSchemaFor,
  type ScorableOffer,
  type ScoringTarget,
} from './scoring.js';

const TARGETS: ScoringTarget[] = [
  { label: 'Data analyst', contractTypes: ['cdi', 'alternance'], keywords: ['data', 'analyste données'] },
  { label: 'Développeur', contractTypes: ['cdi'], keywords: ['développeur', 'software engineer'] },
];

const offer = (changes: Partial<ScorableOffer> = {}): ScorableOffer => ({
  title: 'Data Analyst',
  description: null,
  contractType: 'cdi',
  ...changes,
});

describe('matchedTargetOf — RG-10', () => {
  it('[RG-10] names the target whose keyword appears in the title', () => {
    expect(matchedTargetOf(offer(), TARGETS)).toBe('Data analyst');
  });

  it('[RG-10] reads the description too, not only the title', () => {
    const found = offer({ title: 'Poste ouvert', description: 'Vous rejoignez l’équipe software engineer.' });

    expect(matchedTargetOf(found, TARGETS)).toBe('Développeur');
  });

  it('[RG-10] [RG-14] ignores case and accents, and matches whole words only', () => {
    expect(matchedTargetOf(offer({ title: 'ANALYSTE DONNEES (H/F)' }), TARGETS)).toBe('Data analyst');
    // « data » must not be found inside « database » (EF-VEI-14: a wrong match costs an AI call for nothing).
    expect(matchedTargetOf(offer({ title: 'Database Administrator' }), TARGETS)).toBeNull();
  });

  it('[RG-10] names no target when nothing the candidate looks for appears', () => {
    expect(matchedTargetOf(offer({ title: 'Comptable senior' }), TARGETS)).toBeNull();
  });
});

describe('isWorthScoring — RG-10, EF-VEI-14', () => {
  it('[EF-VEI-14] sends an offer matching a target to the AI', () => {
    expect(isWorthScoring(offer(), TARGETS)).toBe(true);
  });

  it('[EF-VEI-14] sets aside an offer carrying no keyword of a target', () => {
    expect(isWorthScoring(offer({ title: 'Comptable senior' }), TARGETS)).toBe(false);
  });

  it('[RG-10] sets aside a contract the candidate does not look for', () => {
    expect(isWorthScoring(offer({ contractType: 'autre' }), TARGETS)).toBe(false);
  });

  it('[RG-10] keeps an offer whose contract the source did not state', () => {
    // A source that says nothing must not cost the candidate an offer (EF-VEI-21).
    expect(isWorthScoring(offer({ contractType: 'non_precise' }), TARGETS)).toBe(true);
  });

  it('[EF-VEI-14] gives a set-aside offer a score that is not zero', () => {
    expect(PREFILTERED_SCORE).toBeGreaterThan(0);
    expect(PREFILTERED_SCORE).toBeLessThan(10);
  });
});

describe('ScoredOffersSchema — EF-IA-03', () => {
  it('[EF-VEI-12] [EF-VEI-13] reads a score and its reason', () => {
    const parsed = ScoredOffersSchema.parse({
      offers: [{ ref: 1, score: 78, reason: 'Poste de data analyst en CDI à Paris.' }],
    });

    expect(parsed.offers[0]).toEqual({ ref: 1, score: 78, reason: 'Poste de data analyst en CDI à Paris.' });
  });

  it('[EF-IA-03] [EF-IA-07] reads a reference and a score the local model wrote as text, « "3" » for 3: its batches of five do it every time', () => {
    const parsed = ScoredOffersSchema.parse({
      offers: [
        { ref: '1', score: '85', reason: 'Poste de data engineer à Paris.' },
        { ref: ' 2 ', score: 40 },
      ],
    });

    expect(parsed.offers.map(({ ref, score }) => [ref, score])).toEqual([
      [1, 85],
      [2, 40],
    ]);
  });

  it.each([
    ['a reference that is a word', { ref: 'premier', score: 70 }],
    ['a reference with a decimal', { ref: '1.5', score: 70 }],
    ['an empty reference', { ref: '', score: 70 }],
    ['a score with a unit', { ref: 1, score: '85/100' }],
    ['a text score above 100', { ref: 1, score: '140' }],
    ['a text reference of zero', { ref: '0', score: 70 }],
  ])('[EF-IA-03] still refuses %s', (_case, scored) => {
    expect(ScoredOffersSchema.safeParse({ offers: [scored] }).success).toBe(false);
  });

  it('[EF-VEI-13] reads an empty reason as no reason at all', () => {
    const parsed = ScoredOffersSchema.parse({ offers: [{ ref: 1, score: 40, reason: '   ' }] });

    expect(parsed.offers[0]?.reason).toBeNull();
  });

  it.each([
    ['a score above 100', { ref: 1, score: 140 }],
    ['a negative score', { ref: 1, score: -1 }],
    ['a score that is not an integer', { ref: 1, score: 70.5 }],
    ['a reference that is not one', { ref: 0, score: 70 }],
  ])('[EF-IA-03] refuses %s', (_case, scored) => {
    expect(ScoredOffersSchema.safeParse({ offers: [scored] }).success).toBe(false);
  });
});

describe('scoredOffersSchemaFor — a batch of a given size (review of the lot 10)', () => {
  const answer = (...refs: number[]) => ({ offers: refs.map((ref) => ({ ref, score: 70 })) });

  it('[EF-IA-03] accepts an answer that scores at least one offer of the batch, the others being left out', () => {
    expect(scoredOffersSchemaFor(5).safeParse(answer(1, 3)).success).toBe(true);
    expect(scoredOffersSchemaFor(5).safeParse(answer(5)).success).toBe(true);
  });

  it.each([
    ['no offer at all', answer()],
    ['only references that are not in the batch', answer(6, 7)],
  ])('[EF-IA-03] refuses an answer with %s, so that the next provider is asked', (_name, given) => {
    expect(scoredOffersSchemaFor(5).safeParse(given).success).toBe(false);
  });
});
