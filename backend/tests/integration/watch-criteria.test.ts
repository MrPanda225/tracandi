import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import { PlaceLookupError } from '../../src/scraper/official/geo.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;

/** Fictitious criteria: one data target, around Nanterre, remote work accepted. */
const CRITERIA = {
  targets: [
    { label: 'Data analyst', keywords: ['data', 'analyste', 'Data'], contractTypes: ['cdi', 'alternance'] },
  ],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: ['m1419'],
};

const json = (test: request.Test, body?: unknown) =>
  body === undefined
    ? test.set('Cookie', alice)
    : test
        .set('Cookie', alice)
        .set('Content-Type', 'application/json')
        .send(body as object);

const api = {
  read: () => json(request(context.app).get('/api/watch/criteria')),
  save: (body: unknown) => json(request(context.app).put('/api/watch/criteria'), body),
  places: (q: string) => json(request(context.app).get('/api/watch/places').query({ q })),
};

const withServices = async (services: Parameters<typeof createTestContext>[1]): Promise<void> => {
  await truncateAll(database);
  context = createTestContext(database, services);
  alice = await registerUser(context.app, 'alice@example.com');
};

beforeEach(async () => {
  await withServices({});
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('search criteria (EF-VEI-29)', () => {
  it('[EF-VEI-29] has no criteria until the candidate saves some', async () => {
    const read = await api.read();

    expect(read.status).toBe(200);
    expect(read.body).toEqual({ criteria: null });
  });

  it('[EF-VEI-29] saves the criteria and reads them back, each keyword once and ROME codes in capitals', async () => {
    const saved = await api.save(CRITERIA);

    expect(saved.status).toBe(200);
    const expected = {
      ...CRITERIA,
      targets: [{ ...CRITERIA.targets[0], keywords: ['data', 'analyste'] }],
      romeCodes: ['M1419'],
    };
    expect(saved.body).toEqual({ criteria: expected });
    expect((await api.read()).body).toEqual({ criteria: expected });
  });

  it.each([
    ['a radius of 150 km', { ...CRITERIA, radiusKm: 150 }],
    ['a radius of 2 km', { ...CRITERIA, radiusKm: 2 }],
    ['the ROME code « 1405 »', { ...CRITERIA, romeCodes: ['1405'] }],
    ['no target', { ...CRITERIA, targets: [] }],
    ['six targets', { ...CRITERIA, targets: Array.from({ length: 6 }, () => CRITERIA.targets[0]) }],
    ['a target without keyword', { ...CRITERIA, targets: [{ ...CRITERIA.targets[0], keywords: ['  '] }] }],
    [
      'a contract outside the glossary',
      { ...CRITERIA, targets: [{ ...CRITERIA.targets[0], contractTypes: ['stage'] }] },
    ],
    ['a commune without INSEE code', { ...CRITERIA, place: { ...NANTERRE, code: 'Nanterre' } }],
  ])('[EF-VEI-29] [ENF-SEC-04] refuses %s', async (_case, body) => {
    const refused = await api.save(body);

    expect(refused.status).toBe(400);
    expect((await api.read()).body).toEqual({ criteria: null });
  });

  it('[EF-VEI-29] accepts no commune, which means the whole of France', async () => {
    expect((await api.save({ ...CRITERIA, place: null })).body).toMatchObject({ criteria: { place: null } });
  });

  it('[EF-AUT-06] keeps the criteria of each account apart', async () => {
    await api.save(CRITERIA).expect(200);
    const bob = await registerUser(context.app, 'bob@example.com');

    const read = await request(context.app).get('/api/watch/criteria').set('Cookie', bob);

    expect(read.body).toEqual({ criteria: null });
  });

  it('[EF-AUT-05] refuses every route without a session', async () => {
    expect((await request(context.app).get('/api/watch/criteria')).status).toBe(401);
    expect((await request(context.app).get('/api/watch/places').query({ q: 'Nanterre' })).status).toBe(401);
  });
});

describe('communes (EF-VEI-30)', () => {
  it('[EF-VEI-30] finds the commune typed, with its INSEE code and department', async () => {
    const found = await api.places('Nanterre');

    expect(found.status).toBe(200);
    expect(found.body).toEqual({ items: [expect.objectContaining({ code: '92050', departmentCode: '92' })] });
  });

  it('[EF-VEI-30] says so when the public service cannot answer', async () => {
    await withServices({ places: () => Promise.reject(new PlaceLookupError()) });

    const failed = await api.places('Nanterre');

    expect(failed.status).toBe(502);
    expect((failed.body as { error: string }).error).toContain('communes');
  });
});

describe('scoring against the criteria (EF-VEI-31)', () => {
  const BOARD = {
    jobs: [
      {
        id: 1,
        title: 'Data Analyst',
        absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/1',
        location: { name: 'Nanterre' },
        metadata: [],
        content: '&lt;p&gt;SQL.&lt;/p&gt;',
        updated_at: '2026-09-18T08:00:00Z',
      },
    ],
  };

  it('[EF-VEI-31] [RG-09] scores new offers against the targets and the commune of the criteria, without any profile', async () => {
    const prompts: string[] = [];
    const provider: LlmProvider = {
      name: 'gemini',
      model: 'test',
      complete: ({ prompt }) => {
        prompts.push(prompt);
        return Promise.resolve({
          text: JSON.stringify({ offers: [{ ref: 1, score: 82, reason: 'Poste de data analyst proche.' }] }),
          inputTokens: 10,
          outputTokens: 5,
        });
      },
    };
    const collect: AdapterDeps['fetch'] = (url) =>
      Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(BOARD) });
    const providers: Partial<Record<ProviderName, LlmProvider>> = { gemini: provider };
    await withServices({ collect, aiProviders: providers });
    await api.save(CRITERIA).expect(200);
    await json(request(context.app).post('/api/sites'), {
      companyName: 'Atelier Aurore',
      adapter: 'greenhouse',
      identifier: 'atelieraurore',
    }).expect(201);

    const accepted = await json(request(context.app).post('/api/sites/run'), {});
    await context.queue.drain();

    const [user] = await database.db.select({ id: users.id }).from(users).limit(1);
    const state = await context.queue.stateOf(user?.id ?? 0, (accepted.body as { runId: number }).runId);
    expect(state).toMatchObject({ outcome: 'success', counters: { offers_new: 1, offers_relevant: 1 } });
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Data analyst');
    expect(prompts[0]).toContain('Nanterre (92) et 30 km autour, ou en télétravail');
  });
});
