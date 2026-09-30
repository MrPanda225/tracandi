import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { WatchCriteriaSchema } from '../../modules/criteria/schemas.js';
import type { FranceTravailApi } from '../official/franceTravail.js';
import { franceTravailAdapter, publishedSinceDays, queriesFor } from './franceTravail.js';
import { SourceFetchError, type AdapterDeps } from './types.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/official/france-travail.json', import.meta.url), 'utf8'),
) as { resultats: unknown[] };

const NOW = new Date('2026-09-30T08:00:00.000Z');

const CRITERIA = WatchCriteriaSchema.parse({
  targets: [
    { label: 'Data analyst', keywords: ['data'], contractTypes: ['cdi', 'alternance'] },
    { label: 'Vendeur', keywords: ['vente'], contractTypes: ['job_etudiant'] },
  ],
  place: { code: '92050', name: 'Nanterre', departmentCode: '92', latitude: 48.89, longitude: 2.21 },
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: ['M1419'],
});

const depsWith = (
  api: FranceTravailApi | null,
  overrides: Partial<NonNullable<AdapterDeps['official']>> = {},
) => ({
  fetch: () => Promise.reject(new Error('no career site is read for an official source')),
  official: { criteria: CRITERIA, since: null, now: NOW, franceTravail: api, ...overrides },
});

const answering = (results: unknown[]) => {
  const search = vi.fn<FranceTravailApi['search']>(() => Promise.resolve(results));
  return { api: { search }, search };
};

describe('France Travail queries (EF-VEI-32)', () => {
  it('[EF-VEI-32] asks the job title of each target under each kind of contract it accepts, and the ROME codes', () => {
    const queries = queriesFor(CRITERIA, 3);

    expect(queries).toEqual([
      expect.objectContaining({ codeROME: 'M1419', typeContrat: 'CDI' }),
      expect.objectContaining({ codeROME: 'M1419', natureContrat: 'E2,FS' }),
      expect.objectContaining({ codeROME: 'M1419', tempsPlein: 'false' }),
      expect.objectContaining({ motsCles: 'Data analyst', typeContrat: 'CDI' }),
      expect.objectContaining({ motsCles: 'Data analyst', natureContrat: 'E2,FS' }),
      expect.objectContaining({ motsCles: 'Vendeur', tempsPlein: 'false' }),
    ]);
    expect(queries.every((query) => query.commune === '92050' && query.distance === '30')).toBe(true);
    expect(queries.every((query) => query.publieeDepuis === '3' && query.sort === '1')).toBe(true);
  });

  it('[ENF-RGP-11] sends nothing but criteria', () => {
    const keys = new Set(queriesFor(CRITERIA, 7).flatMap((query) => Object.keys(query)));

    expect([...keys].sort()).toEqual(
      [
        'codeROME',
        'commune',
        'distance',
        'motsCles',
        'natureContrat',
        'publieeDepuis',
        'range',
        'sort',
        'tempsPlein',
        'typeContrat',
      ].sort(),
    );
  });

  it('[EF-VEI-32] searches the whole of France without a commune', () => {
    const queries = queriesFor({ ...CRITERIA, place: null }, 7);

    expect(queries.some((query) => 'commune' in query || 'distance' in query)).toBe(false);
  });

  it.each([
    [null, 7],
    [new Date('2026-09-30T02:00:00.000Z'), 1],
    [new Date('2026-09-28T08:00:00.000Z'), 3],
    [new Date('2026-09-20T08:00:00.000Z'), 14],
    [new Date('2026-06-01T08:00:00.000Z'), 31],
  ])('[EF-VEI-32] covers the time since the check of %s with %i days', (since, days) => {
    expect(publishedSinceDays(since, NOW)).toBe(days);
  });
});

describe('France Travail source (EF-VEI-32, EF-VEI-33)', () => {
  it('[EF-VEI-32] reads the offers with their employer, place, contract and page on francetravail.fr', async () => {
    const { api } = answering(FIXTURE.resultats);

    const offers = await franceTravailAdapter.fetchOffers('criteres', depsWith(api));

    expect(offers[0]).toEqual({
      externalId: '198XKZQ',
      title: 'Data analyst (H/F)',
      location: '92 - NANTERRE',
      contractType: 'cdi',
      url: 'https://candidat.francetravail.fr/offres/recherche/detail/198XKZQ',
      description:
        'Vous analysez les ventes et construisez des tableaux de bord Power BI.\n\nExpérience : 2 ans\n\n' +
        'Salaire : Annuel de 38000,00 Euros sur 12 mois',
      postedAt: new Date('2026-09-28T09:12:03.000Z'),
      employerName: 'EXEMPLE CONSEIL SAS',
    });
    expect(offers.find((offer) => offer.externalId === '199ABCD')).toMatchObject({
      contractType: 'alternance',
      employerName: null,
    });
    // Interim is not a contract of the glossary (EF-VEI-21).
    expect(offers.find((offer) => offer.externalId === '201IJKL')?.contractType).toBe('autre');
  });

  it('[EF-VEI-33] leaves out an offer relayed by Indeed, and keeps one relayed by the APEC', async () => {
    const { api } = answering(FIXTURE.resultats);

    const ids = (await franceTravailAdapter.fetchOffers('criteres', depsWith(api))).map(
      (offer) => offer.externalId,
    );

    expect(ids).not.toContain('200EFGH');
    expect(ids).toContain('201IJKL');
  });

  it('[ENF-RGP-09] never keeps the contact of the recruiter', async () => {
    const { api } = answering(FIXTURE.resultats);

    const offers = await franceTravailAdapter.fetchOffers('criteres', depsWith(api));

    const stored = JSON.stringify(offers);
    expect(stored).not.toContain('recrutement@exemple.test');
    expect(stored).not.toContain('01 00 00 00 00');
    expect(stored).not.toContain('Mme Fictive');
  });

  it('[EF-VEI-09] keeps each offer once, whatever the number of queries that found it', async () => {
    const { api, search } = answering(FIXTURE.resultats);

    const offers = await franceTravailAdapter.fetchOffers('criteres', depsWith(api));

    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(new Set(offers.map((offer) => offer.externalId)).size).toBe(offers.length);
    // A result without identifier is skipped, never a reason to lose the others.
    expect(offers).toHaveLength(3);
  });

  it('[EF-VEI-37] says the credentials are missing on the server', async () => {
    await expect(franceTravailAdapter.fetchOffers('criteres', depsWith(null))).rejects.toThrow(
      /Identifiants France Travail non configurés/u,
    );
  });

  it('[EF-VEI-32] asks for search criteria before querying', async () => {
    const { api, search } = answering([]);

    await expect(
      franceTravailAdapter.fetchOffers('criteres', depsWith(api, { criteria: null })),
    ).rejects.toBeInstanceOf(SourceFetchError);
    expect(search).not.toHaveBeenCalled();
  });

  it('[RG-08] accepts only the fixed identifier « criteres »', () => {
    expect(franceTravailAdapter.identifierSchema.safeParse(' Criteres ').success).toBe(true);
    expect(franceTravailAdapter.identifierSchema.safeParse('data').success).toBe(false);
  });
});
