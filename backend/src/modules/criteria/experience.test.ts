import { describe, expect, it } from 'vitest';
import {
  experienceYearsOfPeriods,
  levelOfOffer,
  levelOfTitle,
  levelOfYears,
  PeriodSchema,
  requiredYearsOf,
} from './experience.js';

const NOW = new Date('2026-10-02T08:00:00.000Z');

describe('experienceYearsOfPeriods', () => {
  it('[EF-VEI-43] [RG-29] counts 34 months as 3 years, the two periods of the example being counted month by month', () => {
    const years = experienceYearsOfPeriods(
      [
        { start: '2022-09', end: '2024-08' },
        { start: '2024-09', end: '2025-06' },
      ],
      NOW,
    );

    expect(years).toBe(3);
  });

  it('[RG-29] counts a month covered by two periods once', () => {
    // Two full years, the second period lying wholly inside the first: still 24 months, 2 years.
    expect(
      experienceYearsOfPeriods(
        [
          { start: '2022-01', end: '2023-12' },
          { start: '2022-06', end: '2023-06' },
        ],
        NOW,
      ),
    ).toBe(2);
  });

  it('[RG-29] counts overlapping periods once even when they only partly overlap', () => {
    // January 2022 to June 2023 (18 months), then April 2023 to December 2023 (9 months, 3 already counted): 24.
    expect(
      experienceYearsOfPeriods(
        [
          { start: '2022-01', end: '2023-06' },
          { start: '2023-04', end: '2023-12' },
        ],
        NOW,
      ),
    ).toBe(2);
  });

  it('[RG-29] rounds to the nearest whole year: 17 months give 1, 18 months give 2', () => {
    expect(experienceYearsOfPeriods([{ start: '2024-01', end: '2025-05' }], NOW)).toBe(1);
    expect(experienceYearsOfPeriods([{ start: '2024-01', end: '2025-06' }], NOW)).toBe(2);
  });

  it('[RG-29] reads a period without an end as running until now, a work-study contract or an internship included', () => {
    // September 2025 to October 2026 inclusive: 14 months, 1 year.
    expect(experienceYearsOfPeriods([{ start: '2025-09', end: null }], NOW)).toBe(1);
  });

  it('[EF-VEI-43] gives 0 for no period at all, and never more than 50', () => {
    expect(experienceYearsOfPeriods([], NOW)).toBe(0);
    expect(experienceYearsOfPeriods([{ start: '1900-01', end: null }], NOW)).toBe(50);
  });

  it('[EF-VEI-43] gives the same number for the same periods, whatever their order', () => {
    const periods = [
      { start: '2024-09', end: '2025-06' },
      { start: '2022-09', end: '2024-08' },
    ];

    expect(experienceYearsOfPeriods(periods, NOW)).toBe(
      experienceYearsOfPeriods([...periods].reverse(), NOW),
    );
  });
});

describe('PeriodSchema', () => {
  it.each([
    [{ start: '2022-13', end: null }],
    [{ start: '22-09', end: null }],
    [{ start: '2024-09', end: '2022-01' }],
    [{ start: '2024-09', end: 'jusqu’à ce jour' }],
  ])('[EF-VEI-43] refuses the period %j: a bad date is an error, not a miscount', (period) => {
    expect(PeriodSchema.safeParse(period).success).toBe(false);
  });

  it('[EF-VEI-43] accepts a month-to-month period and an open one', () => {
    expect(PeriodSchema.safeParse({ start: '2022-09', end: '2024-08' }).success).toBe(true);
    expect(PeriodSchema.safeParse({ start: '2022-09', end: null }).success).toBe(true);
  });
});

describe('levelOfYears', () => {
  it.each([
    [0, 'junior'],
    [2, 'junior'],
    [3, 'confirme'],
    [7, 'confirme'],
    [8, 'senior'],
    [30, 'senior'],
  ] as const)('[EF-VEI-44] [RG-28] reads %i years as %s', (years, level) => {
    expect(levelOfYears(years)).toBe(level);
  });
});

describe('requiredYearsOf', () => {
  it.each([
    ['Vous avez 5 ans ou plus d’expérience en analyse de données.', 5],
    ['5 ans d’expérience minimum', 5],
    ['Une expérience de 2 à 3 ans sur un poste similaire', 3],
    ['Expérience : 4+ ans en ingénierie des données', 4],
    ['Au moins 3 ans d’expérience en Python', 3],
    ['Vous justifiez de 8 années d’expérience', 8],
    ['2 ans d’expérience en SQL et 5 ans d’expérience en cloud', 5],
    ['Minimum 3 years of experience with Python', 3],
  ])('[RG-29] reads « %s » as %i years', (text, years) => {
    expect(requiredYearsOf(text)).toBe(years);
  });

  it.each([
    ['Débutant accepté, formation assurée.'],
    ['Notre groupe existe depuis plus de 20 ans.'],
    ['Bac+5 en informatique, 3 ans d’ancienneté dans l’équipe.'],
    [''],
  ])('[RG-29] finds no requirement in « %s »', (text) => {
    expect(requiredYearsOf(text)).toBeNull();
  });

  it('[RG-29] is not fooled by accents or capitals', () => {
    expect(requiredYearsOf('EXPERIENCE: 6 ANS minimum')).toBe(6);
  });
});

describe('levelOfTitle', () => {
  it.each([
    ['Data Engineer Junior', 'junior'],
    ['Développeur débutant', 'junior'],
    ['Développeur Python confirmé', 'confirme'],
    ['Senior Data Scientist', 'senior'],
    ['Lead Developer', 'senior'],
    ['Principal Engineer', 'senior'],
  ] as const)('[RG-28] reads « %s » as %s', (title, level) => {
    expect(levelOfTitle(title)).toBe(level);
  });

  it('[RG-28] gives no level to a title that states none, nor to a word that merely contains one', () => {
    expect(levelOfTitle('Data Engineer')).toBeNull();
    expect(levelOfTitle('Seniorité du poste')).toBeNull();
  });
});

describe('levelOfOffer', () => {
  it('[RG-28] takes the level from the years the text demands when it states them', () => {
    expect(levelOfOffer({ title: 'Data Engineer Junior', text: '5 ans d’expérience minimum' })).toBe(
      'confirme',
    );
  });

  it('[RG-28] takes the level from the title when the text states no years', () => {
    expect(levelOfOffer({ title: 'Senior Data Engineer', text: 'Rejoignez une équipe passionnée.' })).toBe(
      'senior',
    );
  });

  it('[RG-28] says « non précisé » (null) when neither the text nor the title tells', () => {
    expect(levelOfOffer({ title: 'Data Engineer', text: 'Rejoignez une équipe passionnée.' })).toBeNull();
  });
});
