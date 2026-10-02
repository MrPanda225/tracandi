import { describe, expect, it } from 'vitest';
import { buildProfileDeduction, ProfileDeductionAnswerSchema } from './deduction.js';

const NOW = new Date('2026-10-02T08:00:00.000Z');

const TARGET = {
  label: 'Data analyst',
  keywords: ['sql', 'power bi'],
  contractTypes: ['cdi'],
  level: 'junior',
};

const answer = (changes: Record<string, unknown> = {}) => ({
  periods: [{ start: '2022-09', end: '2024-08' }],
  targets: [TARGET],
  ...changes,
});

describe('ProfileDeductionAnswerSchema', () => {
  it('[EF-VEI-45] accepts one to five offers of the shape of the criteria, each with its level', () => {
    expect(ProfileDeductionAnswerSchema.safeParse(answer()).success).toBe(true);
    expect(ProfileDeductionAnswerSchema.safeParse(answer({ targets: Array(5).fill(TARGET) })).success).toBe(
      true,
    );
  });

  it.each([
    ['no offer', { targets: [] }],
    ['six offers', { targets: Array(6).fill(TARGET) }],
    ['an offer with no keyword', { targets: [{ ...TARGET, keywords: [] }] }],
    [
      'an offer with sixteen keywords',
      { targets: [{ ...TARGET, keywords: Array.from({ length: 16 }, (_u, i) => `mot${String(i)}`) }] },
    ],
    ['an offer with no contract', { targets: [{ ...TARGET, contractTypes: [] }] }],
    ['an unknown contract', { targets: [{ ...TARGET, contractTypes: ['freelance'] }] }],
    ['an unknown level', { targets: [{ ...TARGET, level: 'expert' }] }],
    ['no level', { targets: [{ label: 'Data analyst', keywords: ['sql'], contractTypes: ['cdi'] }] }],
    ['an offer with no title', { targets: [{ ...TARGET, label: '' }] }],
    ['a period that ends before it starts', { periods: [{ start: '2024-08', end: '2022-09' }] }],
    ['a period that is not a month', { periods: [{ start: '2022', end: '2024-08' }] }],
    ['no periods at all', { periods: undefined }],
  ])('[EF-IA-03] rejects an answer with %s', (_name, changes) => {
    expect(ProfileDeductionAnswerSchema.safeParse(answer(changes)).success).toBe(false);
  });

  it('[EF-VEI-43] accepts a CV with no experience: the periods may be empty', () => {
    expect(ProfileDeductionAnswerSchema.safeParse(answer({ periods: [] })).success).toBe(true);
  });

  it.each(['present', 'Présent', 'en cours', "aujourd'hui", 'actuel', 'now'])(
    '[EF-VEI-43] reads « %s » as an experience that goes on',
    (end) => {
      const parsed = ProfileDeductionAnswerSchema.parse(answer({ periods: [{ start: '2024-09', end }] }));

      expect(parsed.periods).toEqual([{ start: '2024-09', end: null }]);
    },
  );

  it('[EF-VEI-43] drops a number of years the model volunteers: the schema has no place for it', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(answer({ years: 12, experienceYears: 12 }));

    expect(parsed).not.toHaveProperty('years');
    expect(parsed).not.toHaveProperty('experienceYears');
  });

  it('[EF-VEI-45] keeps each keyword once, whatever its case', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ targets: [{ ...TARGET, keywords: ['SQL', 'sql', 'Python'] }] }),
    );

    expect(parsed.targets[0]?.keywords).toEqual(['SQL', 'Python']);
  });
});

describe('buildProfileDeduction', () => {
  it('[EF-VEI-43] [RG-29] counts 34 months as 3 years, whatever the model says', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({
        years: 12,
        periods: [
          { start: '2022-09', end: '2024-08' },
          { start: '2024-09', end: '2025-06' },
        ],
      }),
    );

    expect(buildProfileDeduction(parsed, NOW)).toMatchObject({ years: 3, level: 'confirme' });
  });

  it('[EF-VEI-44] [RG-28] gives the level of the years: 2 junior, 3 and 7 confirmé, 8 senior', () => {
    const levelOf = (start: string, end: string) =>
      buildProfileDeduction(ProfileDeductionAnswerSchema.parse(answer({ periods: [{ start, end }] })), NOW);

    expect(levelOf('2022-01', '2023-12')).toMatchObject({ years: 2, level: 'junior' });
    expect(levelOf('2021-01', '2023-12')).toMatchObject({ years: 3, level: 'confirme' });
    expect(levelOf('2017-01', '2023-12')).toMatchObject({ years: 7, level: 'confirme' });
    expect(levelOf('2016-01', '2023-12')).toMatchObject({ years: 8, level: 'senior' });
  });

  it('[EF-VEI-43] counts an experience that goes on up to today', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ periods: [{ start: '2024-10', end: 'present' }] }),
    );

    // October 2024 to October 2026, both months included: 25 months, 2 years.
    expect(buildProfileDeduction(parsed, NOW).years).toBe(2);
  });

  it('[EF-VEI-43] gives 0 years, junior, to a CV with no experience', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(answer({ periods: [] }));

    expect(buildProfileDeduction(parsed, NOW)).toMatchObject({ years: 0, level: 'junior' });
  });

  it('[EF-VEI-45] hands the offers on as the model proposed them', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(answer());

    expect(buildProfileDeduction(parsed, NOW).targets).toEqual([TARGET]);
  });
});
