import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobOffers, users, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import type { FranceTravailApi } from '../../src/scraper/official/franceTravail.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const FIXTURE = JSON.parse(
  readFileSync(new URL('../fixtures/official/france-travail.json', import.meta.url), 'utf8'),
) as { resultats: unknown[] };

const database = openTestDatabase();
let context: TestContext;
let alice: string;

const CRITERIA = {
  targets: [
    { label: 'Data analyst', keywords: ['data', 'statistiques'], contractTypes: ['cdi', 'alternance'] },
  ],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

const OFFICIAL_SOURCE = { adapter: 'france_travail', identifier: 'criteres' };

/** Every offer scored 75: the test is about what reaches the database, not about the scoring. */
const scoringAi: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: ({ prompt }) => {
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({
        offers: refs.map((ref) => ({ ref, score: 75, reason: 'Proche de vos cibles.' })),
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

describe('France Travail source (EF-VEI-32, EF-VEI-33, EF-VEI-37)', () => {
  it('[EF-VEI-32] adds a single France Travail source, without company', async () => {
    const added = await send('post', '/api/sites', OFFICIAL_SOURCE);

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      companyName: null,
      adapter: 'france_travail',
      adapterLabel: 'France Travail',
    });
    expect((await send('post', '/api/sites', OFFICIAL_SOURCE)).status).toBe(409);
  });

  it('[EF-VEI-01] still asks a company for a company source', async () => {
    expect(
      (await send('post', '/api/sites', { adapter: 'greenhouse', identifier: 'atelieraurore' })).status,
    ).toBe(400);
  });

  it('[EF-VEI-32] [EF-VEI-33] [ENF-RGP-09] stores the offers with their employer, never a contact, never an Indeed offer', async () => {
    const search = vi.fn<FranceTravailApi['search']>(() => Promise.resolve(FIXTURE.resultats));
    await withServices({ official: { franceTravail: { search } } });
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', OFFICIAL_SOURCE).expect(201);

    const state = await runAndWait();

    expect(state).toMatchObject({ outcome: 'success', counters: { sources_checked: 1 } });
    // The criteria went out, nothing else: the commune and the radius, the job title of the target (ENF-RGP-11).
    expect(search.mock.calls[0]?.[0]).toMatchObject({ commune: '92050', distance: '30', publieeDepuis: '7' });
    const stored = await database.db
      .select({
        externalId: jobOffers.externalId,
        companyName: jobOffers.companyName,
        description: jobOffers.description,
      })
      .from(jobOffers);
    expect(stored.map((offer) => offer.externalId).sort()).toEqual(['198XKZQ', '199ABCD', '201IJKL']);
    expect(JSON.stringify(stored)).not.toContain('recrutement@exemple.test');

    const listed = await request(context.app).get('/api/offers').set('Cookie', alice);
    expect(
      (listed.body as { items: { companyName: string }[] }).items.map((item) => item.companyName),
    ).toContain('EXEMPLE CONSEIL SAS');
  });

  it('[EF-VEI-37] [ENF-FIA-02] says the credentials are missing on that source alone, and reads the others', async () => {
    const collect: AdapterDeps['fetch'] = (url) =>
      Promise.resolve({
        url,
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jobs: [] }),
      });
    await withServices({ collect });
    await send('put', '/api/watch/criteria', CRITERIA).expect(200);
    await send('post', '/api/sites', OFFICIAL_SOURCE).expect(201);
    await send('post', '/api/sites', {
      companyName: 'Atelier Aurore',
      adapter: 'greenhouse',
      identifier: 'atelieraurore',
    }).expect(201);

    const state = await runAndWait();

    expect(state).toMatchObject({ outcome: 'success', counters: { sources_checked: 1 } });
    const sources = await database.db
      .select({ adapter: watchedSites.adapter, lastError: watchedSites.lastError })
      .from(watchedSites);
    expect(sources.find((source) => source.adapter === 'france_travail')?.lastError).toContain(
      'Identifiants France Travail non configurés',
    );
    expect(sources.find((source) => source.adapter === 'greenhouse')?.lastError).toBeNull();
  });

  it('[EF-AUT-12] exports the official source of the candidate', async () => {
    await send('post', '/api/sites', OFFICIAL_SOURCE).expect(201);

    const exported = await request(context.app).get('/api/account/export').set('Cookie', alice);

    expect(exported.body).toMatchObject({ watchedSites: [{ adapter: 'france_travail', companyId: null }] });
  });
});
