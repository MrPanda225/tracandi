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
