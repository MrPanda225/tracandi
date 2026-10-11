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
    ['an offer with no keyword', { targets: [{ ...TARGET, keywords: [] }] }],
    ['an offer with no contract', { targets: [{ ...TARGET, contractTypes: [] }] }],
    ['an unknown contract', { targets: [{ ...TARGET, contractTypes: ['freelance'] }] }],
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

describe('ProfileDeductionAnswerSchema, what a small model gets wrong (T-1010)', () => {
  it('[EF-VEI-45] keeps the offers that are well formed and leaves out the ones that are not', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({
        targets: [
          TARGET,
          { ...TARGET, label: 'Sans contrat connu', contractTypes: ['freelance'] },
          { ...TARGET, label: 'Sans mot-clé', keywords: [] },
        ],
      }),
    );

    expect(parsed.targets.map((target) => target.label)).toEqual(['Data analyst']);
  });

  it('[EF-VEI-45] keeps the contracts it knows of an offer that lists a made-up one: « cdn » is no reason to lose it', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ targets: [{ ...TARGET, contractTypes: ['cdn', 'CDI', 'Alternance', 'cdi'] }] }),
    );

    expect(parsed.targets[0]?.contractTypes).toEqual(['cdi', 'alternance']);
  });

  it('[EF-IA-03] refuses an answer whose offers are all malformed', () => {
    const parsed = ProfileDeductionAnswerSchema.safeParse(
      answer({
        targets: [
          { ...TARGET, contractTypes: ['freelance'] },
          { ...TARGET, keywords: [] },
        ],
      }),
    );

    expect(parsed.success).toBe(false);
  });

  it.each([['junor'], ['expert'], [''], [null], [3]])(
    '[EF-VEI-45] [RG-28] gives the offer the level of the candidate when the model wrote the level « %s » badly',
    (level) => {
      const parsed = ProfileDeductionAnswerSchema.parse(answer({ targets: [{ ...TARGET, level }] }));

      expect(buildProfileDeduction(parsed, NOW)).toMatchObject({
        years: 2,
        level: 'junior',
        targets: [{ label: 'Data analyst', level: 'junior' }],
      });
    },
  );

  it('[EF-VEI-45] gives the offer the level of the candidate when the model gave none', () => {
    const withoutLevel = { label: 'Data analyst', keywords: ['sql', 'power bi'], contractTypes: ['cdi'] };
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ periods: [{ start: '2016-01', end: '2023-12' }], targets: [withoutLevel] }),
    );

    expect(buildProfileDeduction(parsed, NOW).targets[0]).toMatchObject({ level: 'senior' });
  });

  it.each([
    ['Confirmé', 'confirme'],
    [' SENIOR ', 'senior'],
    ['Junior', 'junior'],
  ])('[EF-VEI-45] reads the level « %s » as %s', (written, level) => {
    const parsed = ProfileDeductionAnswerSchema.parse(answer({ targets: [{ ...TARGET, level: written }] }));

    expect(parsed.targets[0]?.level).toBe(level);
  });

  it('[EF-VEI-45] keeps the first five offers when the model proposes more, and the first fifteen keywords of each', () => {
    const many = Array.from({ length: 7 }, (_unused, index) => ({
      ...TARGET,
      label: `Offre ${String(index)}`,
      keywords: Array.from({ length: 18 }, (_u, i) => `mot${String(i)}`),
    }));

    const built = buildProfileDeduction(ProfileDeductionAnswerSchema.parse(answer({ targets: many })), NOW);

    expect(built.targets.map((target) => target.label)).toEqual([
      'Offre 0',
      'Offre 1',
      'Offre 2',
      'Offre 3',
      'Offre 4',
    ]);
    expect(built.targets[0]?.keywords).toHaveLength(15);
  });

  it('[EF-VEI-45] drops a keyword that is empty, too long or not text, and keeps the rest', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ targets: [{ ...TARGET, keywords: ['sql', '', '   ', 'x'.repeat(61), 4, null, 'dbt'] }] }),
    );

    expect(parsed.targets[0]?.keywords).toEqual(['sql', 'dbt']);
  });

  it.each(['null', 'NULL', 'none'])(
    '[EF-VEI-43] reads an end written « %s » as an experience that goes on',
    (end) => {
      const parsed = ProfileDeductionAnswerSchema.parse(answer({ periods: [{ start: '2024-09', end }] }));

      expect(parsed.periods).toEqual([{ start: '2024-09', end: null }]);
    },
  );

  it.each([
    ['09/2023', '2023-09'],
    ['9/2023', '2023-09'],
    ['2023/09', '2023-09'],
    ['2023-9', '2023-09'],
    [' 2023-09 ', '2023-09'],
  ])('[EF-VEI-43] reads the month written « %s » as %s', (written, month) => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ periods: [{ start: written, end: written }] }),
    );

    expect(parsed.periods).toEqual([{ start: month, end: month }]);
  });

  it.each([['2023'], ['septembre 2023'], ['13/2023'], ['2023-13'], ['hier']])(
    '[EF-VEI-43] [RG-29] still refuses the month « %s »: a year miscounted in silence is worse than a second provider',
    (written) => {
      const parsed = ProfileDeductionAnswerSchema.safeParse(
        answer({ periods: [{ start: written, end: null }] }),
      );

      expect(parsed.success).toBe(false);
    },
  );

  it('[EF-VEI-43] ignores the fields a model adds to a period', () => {
    const parsed = ProfileDeductionAnswerSchema.parse(
      answer({ periods: [{ start: '2023-09', end: null, label: 'Data engineer en alternance' }] }),
    );

    expect(parsed.periods).toEqual([{ start: '2023-09', end: null }]);
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
