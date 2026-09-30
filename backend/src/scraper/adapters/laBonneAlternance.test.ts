import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { WatchCriteriaSchema } from '../../modules/criteria/schemas.js';
import type { LaBonneAlternanceApi } from '../official/laBonneAlternance.js';
import { laBonneAlternanceAdapter, workStudyQueryOf, workStudyRefusalOf } from './laBonneAlternance.js';
import type { AdapterDeps } from './types.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/official/la-bonne-alternance.json', import.meta.url), 'utf8'),
) as { jobs: unknown[] };

const CRITERIA = WatchCriteriaSchema.parse({
  targets: [{ label: 'Data analyst', keywords: ['data'], contractTypes: ['cdi', 'alternance'] }],
  place: { code: '92050', name: 'Nanterre', departmentCode: '92', latitude: 48.8924, longitude: 2.2071 },
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: ['M1419', 'M1811'],
});

const depsWith = (api: LaBonneAlternanceApi | null, criteria = CRITERIA): AdapterDeps => ({
  fetch: () => Promise.reject(new Error('no career site is read for an official source')),
  official: {
    criteria,
    since: null,
    now: new Date('2026-09-30T08:00:00Z'),
    franceTravail: null,
    laBonneAlternance: api,
  },
});

describe('La bonne alternance (EF-VEI-34)', () => {
  it('[EF-VEI-34] [ENF-RGP-11] asks by ROME codes around the commune, and nothing else', () => {
    expect(workStudyQueryOf(CRITERIA)).toEqual({
      romes: 'M1419,M1811',
      latitude: '48.8924',
      longitude: '2.2071',
      radius: '30',
    });
    expect(workStudyQueryOf({ ...CRITERIA, place: null })).toEqual({ romes: 'M1419,M1811' });
  });

  it('[EF-VEI-34] refuses criteria without a target that accepts work-study, or without ROME code', () => {
    expect(workStudyRefusalOf(CRITERIA)).toBeNull();
    expect(
      workStudyRefusalOf({
        ...CRITERIA,
        targets: [{ ...CRITERIA.targets[0], contractTypes: ['cdi'] }] as never,
      }),
    ).toContain('alternance');
    expect(workStudyRefusalOf({ ...CRITERIA, romeCodes: [] })).toContain('code ROME');
    expect(workStudyRefusalOf(null)).toContain('critères');
  });

  it('[EF-VEI-34] [EF-VEI-35] reads the open offers, in work-study, with their employer and SIREN', async () => {
    const search = vi.fn<LaBonneAlternanceApi['search']>(() => Promise.resolve(FIXTURE.jobs));

    const offers = await laBonneAlternanceAdapter.fetchOffers('criteres', depsWith({ search }));

    expect(offers).toHaveLength(2);
    expect(offers[0]).toEqual({
      externalId: '6650f0c1a2b3c4d5e6f70812',
      title: 'Data analyst en alternance',
      location: "10 rue de l'Exemple 92000 Nanterre",
      contractType: 'alternance',
      url: 'https://labonnealternance.apprentissage.beta.gouv.fr/emploi/offres_emploi_lba/6650f0c1a2b3c4d5e6f70812/data-analyst',
      description: 'Tableaux de bord et analyses de ventes.\n\nCompétences attendues : SQL, Power BI',
      postedAt: new Date('2026-09-20T08:00:00.000Z'),
      employerName: 'Atelier Numérique',
      employerSiren: '123456789',
    });
    // An offer without its own identifier is known by its partner and the partner's identifier.
    expect(offers[1]).toMatchObject({ externalId: 'France Travail:199ZZZZ', employerSiren: null });
  });

  it('[EF-VEI-33] [ENF-RGP-09] leaves out closed and Indeed offers, and never keeps the recruiter phone', async () => {
    const search = vi.fn<LaBonneAlternanceApi['search']>(() => Promise.resolve(FIXTURE.jobs));

    const offers = await laBonneAlternanceAdapter.fetchOffers('criteres', depsWith({ search }));

    expect(offers.map((offer) => offer.externalId)).not.toContain('indeed-1');
    expect(offers.map((offer) => offer.externalId)).not.toContain('closed-1');
    expect(JSON.stringify(offers)).not.toContain('01 00 00 00 00');
  });

  it('[EF-VEI-37] says the key is missing on the server', async () => {
    await expect(laBonneAlternanceAdapter.fetchOffers('criteres', depsWith(null))).rejects.toThrow(
      /LBA_API_KEY/u,
    );
  });

  it('[EF-VEI-34] never queries with criteria it cannot use', async () => {
    const search = vi.fn<LaBonneAlternanceApi['search']>(() => Promise.resolve([]));

    await expect(
      laBonneAlternanceAdapter.fetchOffers('criteres', depsWith({ search }, { ...CRITERIA, romeCodes: [] })),
    ).rejects.toThrow(/code ROME/u);
    expect(search).not.toHaveBeenCalled();
  });
});
