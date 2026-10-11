import { describe, expect, it } from 'vitest';
import { WatchCriteriaSchema } from './schemas.js';
import { scoringProfileOf } from './service.js';

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['data'], contractTypes: ['cdi'] }],
  place: { code: '2A004', name: 'Ajaccio', departmentCode: '2A', latitude: 41.93, longitude: 8.74 },
  radiusKm: 20,
  acceptsRemote: false,
  romeCodes: [],
};

describe('search criteria (EF-VEI-29)', () => {
  it('[EF-VEI-29] accepts a Corsican commune', () => {
    expect(WatchCriteriaSchema.safeParse(CRITERIA).success).toBe(true);
  });

  it('[EF-VEI-29] keeps each contract type once', () => {
    const parsed = WatchCriteriaSchema.parse({
      ...CRITERIA,
      targets: [{ ...CRITERIA.targets[0], contractTypes: ['cdi', 'cdi', 'cdd'] }],
    });

    expect(parsed.targets[0]?.contractTypes).toEqual(['cdi', 'cdd']);
  });

  it('[EF-VEI-29] refuses eleven ROME codes', () => {
    const romeCodes = Array.from({ length: 11 }, (_, index) => `M14${String(index).padStart(2, '0')}`);

    expect(WatchCriteriaSchema.safeParse({ ...CRITERIA, romeCodes }).success).toBe(false);
  });
});

describe('scoring profile (EF-VEI-31)', () => {
  it('[EF-VEI-31] [RG-09] states the commune, the radius and the refusal of remote work', () => {
    const profile = scoringProfileOf(WatchCriteriaSchema.parse(CRITERIA));

    expect(profile.searchArea).toBe('Ajaccio (2A) et 20 km autour ; télétravail non recherché');
    expect(profile.targets).toEqual([{ label: 'Data analyst', keywords: ['data'], contractTypes: ['cdi'] }]);
  });

  it('[EF-VEI-31] says the whole of France when no commune is chosen', () => {
    const profile = scoringProfileOf(
      WatchCriteriaSchema.parse({ ...CRITERIA, place: null, acceptsRemote: true }),
    );

    expect(profile.searchArea).toBe('toute la France, ou en télétravail');
  });
});

describe('level and years of experience in the criteria (EF-VEI-50, EF-VEI-47)', () => {
  it('[EF-VEI-50] keeps criteria without level or years as they are, so that the scoring stays as it was', () => {
    const parsed = WatchCriteriaSchema.parse(CRITERIA);

    expect(parsed).not.toHaveProperty('level');
    expect(parsed).not.toHaveProperty('years');
  });

  it.each([
    [0, 'junior'],
    [2, 'junior'],
    [6, 'confirme'],
    [8, 'senior'],
  ] as const)(
    '[EF-VEI-47] [RG-28] reads %i years as the level %s, the level being worked out again from the years',
    (years, level) => {
      // A level given beside the years never wins over them: corrected years give a new level.
      expect(WatchCriteriaSchema.parse({ ...CRITERIA, years, level: 'senior' })).toMatchObject({
        years,
        level,
      });
    },
  );

  it('[EF-VEI-50] accepts a level alone, without years', () => {
    expect(WatchCriteriaSchema.parse({ ...CRITERIA, level: 'confirme' })).toMatchObject({
      level: 'confirme',
    });
  });

  it.each([[-1], [51], [2.5]])('[EF-VEI-47] refuses %s years of experience', (years) => {
    expect(WatchCriteriaSchema.safeParse({ ...CRITERIA, years }).success).toBe(false);
  });

  it('[EF-VEI-50] refuses a level that is not junior, confirmé or senior', () => {
    expect(WatchCriteriaSchema.safeParse({ ...CRITERIA, level: 'expert' }).success).toBe(false);
  });

  it('[EF-VEI-50] hands the level to the scoring profile, and none when the criteria have none', () => {
    expect(scoringProfileOf(WatchCriteriaSchema.parse({ ...CRITERIA, years: 9 })).level).toBe('senior');
    expect(scoringProfileOf(WatchCriteriaSchema.parse(CRITERIA)).level).toBeUndefined();
  });
});
