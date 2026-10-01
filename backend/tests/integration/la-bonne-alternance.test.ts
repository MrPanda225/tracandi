import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { companies, jobOffers, users } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { FranceTravailApi } from '../../src/scraper/official/franceTravail.js';
import type { LaBonneAlternanceApi } from '../../src/scraper/official/laBonneAlternance.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/official/la-bonne-alternance.json', import.meta.url), 'utf8'),
) as { jobs: unknown[] };

const database = openTestDatabase();
let context: TestContext;
let alice: string;

const TARGET = { label: 'Data analyst', keywords: ['data', 'analyst'], contractTypes: ['cdi', 'alternance'] };
const CRITERIA = {
  targets: [TARGET],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: ['M1419'],
};
const WORK_STUDY = { adapter: 'la_bonne_alternance', identifier: 'criteres' };

const scoringAi: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: ({ prompt }) => {
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({
        offers: refs.map((ref) => ({ ref, score: 80, reason: 'Proche de vos cibles.' })),
      }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
};

const send = (method: 'post' | 'put', path: string, body: unknown) => {
  const test = method === 'post' ? request(context.app).post(path) : request(context.app).put(path);
  return test
    .set('Cookie', alice)
    .set('Content-Type', 'application/json')
    .send(body as object);
};

const runAndWait = async () => {
  const accepted = await send('post', '/api/sites/run', {});
  await context.queue.drain();
  const [user] = await database.db.select({ id: users.id }).from(users).limit(1);
  return context.queue.stateOf(user?.id ?? 0, (accepted.body as { runId: number }).runId);
};

const listOffers = async () =>
  (await request(context.app).get('/api/offers').set('Cookie', alice)).body as {
    items: { companyName: string; isFromAppliedCompany: boolean }[];
  };

const withServices = async (services: Parameters<typeof createTestContext>[1]) => {
  await truncateAll(database);
  context = createTestContext(database, { aiProviders: { gemini: scoringAi }, ...services });
  alice = await registerUser(context.app, 'alice@example.com');
};

beforeEach(async () => {
  await withServices({});
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('La bonne alternance (EF-VEI-34)', () => {
  it('[EF-VEI-34] refuses the source while no target accepts work-study', async () => {
    await send('put', '/api/watch/criteria', {
      ...CRITERIA,
      targets: [{ ...TARGET, contractTypes: ['cdi'] }],
    }).expect(200);

    const refused = await send('post', '/api/sites', WORK_STUDY);

    expect(refused.status).toBe(400);
    expect((refused.body as { error: string }).error).toContain('alternance');
  });

  it('[EF-VEI-34] [EF-VEI-35] stores the work-study offers with the SIREN of their employer', async () => {
    const search = vi.fn<LaBonneAlternanceApi['search']>(() => Promise.resolve(FIXTURE.jobs));
    await withServices({ official: { laBonneAlternance: { search } } });
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', WORK_STUDY).expect(201);

    expect(await runAndWait()).toMatchObject({
      outcome: 'success',
      counters: { sources_checked: 1, offers_new: 2 },
    });

    expect(search.mock.calls[0]?.[0]).toEqual({
      romes: 'M1419',
      latitude: '48.8924',
      longitude: '2.2071',
      radius: '30',
    });
    const stored = await database.db
      .select({ contractType: jobOffers.contractType, companySiren: jobOffers.companySiren })
      .from(jobOffers);
    expect(stored.every((offer) => offer.contractType === 'alternance')).toBe(true);
    expect(stored.map((offer) => offer.companySiren)).toContain('123456789');
  });
});

describe('offers of the companies applied to (EF-VEI-35, EF-VEI-36)', () => {
  const franceTravailWith = (employer: string, siret?: string): FranceTravailApi => ({
    search: () =>
      Promise.resolve([
        {
          id: '300AAAA',
          intitule: 'Data analyst',
          dateCreation: '2026-09-28T09:00:00.000Z',
          entreprise: { nom: employer, ...(siret ? { siret } : {}) },
          typeContrat: 'CDI',
          alternance: false,
        },
      ]),
  });

  const applyAt = (companyName: string) =>
    send('post', '/api/applications', { companyName, jobTitle: 'Chargé de données', status: 'sent' }).expect(
      201,
    );

  it('[EF-VEI-35] [RG-26] flags an offer of « CAPGEMINI SE » for a candidate who applied at « Capgemini »', async () => {
    await withServices({ official: { franceTravail: franceTravailWith('CAPGEMINI SE') } });
    await applyAt('Capgemini');
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);
    await runAndWait();

    expect((await listOffers()).items).toEqual([
      expect.objectContaining({ companyName: 'CAPGEMINI SE', isFromAppliedCompany: true }),
    ]);
  });

  it('[EF-VEI-35] leaves unflagged an offer of an employer the candidate never applied to', async () => {
    await withServices({ official: { franceTravail: franceTravailWith('AUTRE EXEMPLE') } });
    await applyAt('Capgemini');
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);
    await runAndWait();

    expect((await listOffers()).items).toEqual([expect.objectContaining({ isFromAppliedCompany: false })]);
  });

  it('[EF-VEI-36] [EF-VEI-35] finds the SIREN of a company applied to, and flags an offer by it under another name', async () => {
    const findSiren = vi.fn(() => Promise.resolve('123456789'));
    await withServices({
      official: { franceTravail: franceTravailWith('EXEMPLE HOLDING', '12345678900012'), findSiren },
    });
    await applyAt('Exemple Conseil');
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);

    await runAndWait();
    await runAndWait();

    const [company] = await database.db.select().from(companies).where(eq(companies.name, 'Exemple Conseil'));
    expect(company?.siren).toBe('123456789');
    // Looked for once: the next pass does not ask again (ENF-COL-05).
    expect(findSiren).toHaveBeenCalledTimes(1);
    expect((await listOffers()).items).toEqual([expect.objectContaining({ isFromAppliedCompany: true })]);
  });

  it('[EF-VEI-36] [ENF-FIA-02] runs the watch even when the SIREN search fails', async () => {
    const findSiren = vi.fn(() => Promise.reject(new Error('API Recherche d’entreprises injoignable')));
    await withServices({ official: { franceTravail: franceTravailWith('EXEMPLE'), findSiren } });
    await applyAt('Exemple');
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);

    expect(await runAndWait()).toMatchObject({ outcome: 'success', counters: { offers_new: 1 } });
  });
});
