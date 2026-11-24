import { describe, expect, it } from 'vitest';
import { TailorCvAnswerSchema } from './tailorCvAnswer.js';

const VALID = {
  headline: 'Data Analyst',
  profile: 'Analyste.',
  experiences: [{ id: 'exp_0', bullets: ['Création de tableaux de bord.'] }],
  education: [{ id: 'edu_0', details: ['edu_0.d0'] }],
  skills: ['skill_0'],
  certifications: [],
  languages: [],
  interests: [],
  changes: [{ target: 'exp_0', reason: 'Pour l’offre.' }],
};

describe('TailorCvAnswerSchema', () => {
  it('[EF-CVX-47] accepts the answer of the contract', () => {
    expect(TailorCvAnswerSchema.parse(VALID)).toEqual(VALID);
  });

  it('[EF-CVX-47] drops the fields the contract does not know, so a typed fact never reaches the assembly', () => {
    const parsed = TailorCvAnswerSchema.parse({
      ...VALID,
      experiences: [{ id: 'exp_0', title: 'Lead', organization: 'X', bullets: ['Un.'] }],
      extra: 1,
    });

    expect(parsed.experiences).toEqual([{ id: 'exp_0', bullets: ['Un.'] }]);
    expect(parsed).not.toHaveProperty('extra');
  });

  it('[EF-CVX-47] leaves out the unusable parts instead of failing the answer', () => {
    const parsed = TailorCvAnswerSchema.parse({
      headline: 42,
      profile: '',
      experiences: [{ id: 'oops', bullets: [] }, { id: 'exp_1', bullets: ['ok', 3, '', 'x'.repeat(301)] }, 'bad'],
      education: 'none',
      skills: ['skill_0', 7],
      changes: [{ target: 'exp_1' }, { target: 'exp_1', reason: 'ok' }],
    });

    expect(parsed).toEqual({
      headline: null,
      profile: null,
      experiences: [{ id: 'exp_1', bullets: ['ok'] }],
      education: [],
      skills: ['skill_0'],
      certifications: [],
      languages: [],
      interests: [],
      changes: [{ target: 'exp_1', reason: 'ok' }],
    });
  });

  it('[EF-CVX-47] caps the lists', () => {
    const parsed = TailorCvAnswerSchema.parse({
      ...VALID,
      skills: Array.from({ length: 100 }, (_unused, index) => `skill_${String(index)}`),
      changes: Array.from({ length: 50 }, () => ({ target: 'exp_0', reason: 'r' })),
    });

    expect(parsed.skills).toHaveLength(60);
    expect(parsed.changes).toHaveLength(30);
  });

  it('[EF-CVX-47] refuses what is not an answer: not an object, or without its experiences', () => {
    expect(TailorCvAnswerSchema.safeParse('texte').success).toBe(false);
    expect(TailorCvAnswerSchema.safeParse({ ...VALID, experiences: undefined }).success).toBe(false);
    expect(TailorCvAnswerSchema.safeParse({ ...VALID, experiences: 'x' }).success).toBe(false);
  });
});
