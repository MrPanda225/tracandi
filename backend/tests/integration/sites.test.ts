import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobOffers, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;

// The anonymised profile of the fixtures: the real one is never read (CLAUDE.md).
const PROFILE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/profile.example.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

const GREENHOUSE_BOARD = {
  jobs: [
    {
      id: 1,
      title: 'Data Analyst',
      absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/1',
      location: { name: 'Paris' },
      metadata: [{ name: 'Type de contrat', value: 'CDI' }],
      content: '&lt;p&gt;Tableaux de bord et SQL.&lt;/p&gt;',
      updated_at: '2026-09-18T08:00:00Z',
    },
    {
      id: 2,
      title: 'Comptable senior',
      absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/2',
      location: { name: 'Lyon' },
      metadata: [],
      content: '&lt;p&gt;Clôtures mensuelles.&lt;/p&gt;',
      updated_at: '2026-09-18T08:00:00Z',
    },
  ],
};

/** A collector answering one recorded board; no request ever leaves the test (testing.md). */
const boardCollector = (body: unknown, status = 200): AdapterDeps['fetch'] =>
  vi.fn((url: string) =>
    Promise.resolve({
      url,
      status,
      contentType: 'application/json',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

/** An AI answering the same scores to every batch, and counting how many times it was called. */
const scoringAi = (
  answer: unknown,
): { providers: Partial<Record<ProviderName, LlmProvider>>; calls: () => number } => {
  let calls = 0;
  const provider: LlmProvider = {
    name: 'gemini',
    model: 'test',
    complete: () => {
      calls += 1;
      return Promise.resolve({ text: JSON.stringify(answer), inputTokens: 10, outputTokens: 5 });
    },
  };
  return { providers: { gemini: provider }, calls: () => calls };
};

const api = (cookie: string) => ({
  list: () => request(context.app).get('/api/sites').set('Cookie', cookie),
  add: (body: unknown) =>
    request(context.app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  update: (id: number, body: unknown) =>
    request(context.app)
      .patch(`/api/sites/${id}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  remove: (id: number) =>
    request(context.app)
      .delete(`/api/sites/${id}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json'),
  run: () =>
    request(context.app).post('/api/sites/run').set('Cookie', cookie).set('Content-Type', 'application/json'),
  saveProfile: (profile: unknown) =>
    request(context.app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(profile as object),
});

const GREENHOUSE_SOURCE = {
  companyName: 'Atelier Aurore',
  adapter: 'greenhouse',
  identifier: 'atelieraurore',
};

/** A profile whose only target matches « Data Analyst » and not « Comptable senior » (RG-10). */
const DATA_PROFILE = {
  ...PROFILE,
  targets: [{ label: 'Data analyst', contractTypes: ['cdi', 'alternance'], keywords: ['data', 'analyste'] }],
};

/**
 * Rebuilds the application with its own doubles. The database is emptied first, so the account registered just
 * after is the same alice the other tests use.
 */
const withServices = async (services: Parameters<typeof createTestContext>[1]): Promise<void> => {
  await truncateAll(database);
  context = createTestContext(database, services);
  alice = await registerUser(context.app, 'alice@example.com');
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('watched sources (EF-VEI-01 to EF-VEI-05)', () => {
  it('[EF-VEI-01] adds a source and lists it with its company', async () => {
    const added = await api(alice).add(GREENHOUSE_SOURCE);

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      companyName: 'Atelier Aurore',
      adapter: 'greenhouse',
      adapterLabel: 'Greenhouse',
      identifier: 'atelieraurore',
      isActive: true,
      lastCheckedAt: null,
      lastError: null,
      offerCount: 0,
    });
    expect((await api(alice).list()).body).toMatchObject({ items: [{ identifier: 'atelieraurore' }] });
  });

  it.each([
    ['an identifier outside RG-08', { ...GREENHOUSE_SOURCE, identifier: '../../etc' }],
    ['a source type that does not exist', { ...GREENHOUSE_SOURCE, adapter: 'linkedin' }],
    ['no company name', { ...GREENHOUSE_SOURCE, companyName: '   ' }],
    [
      'a Workday address outside its domain',
      { companyName: 'Nova', adapter: 'workday', identifier: 'https://nova.example.com/Carrieres' },
    ],
  ])('[EF-VEI-02] [ENF-SEC-04] refuses %s', async (_case, body) => {
    const refused = await api(alice).add(body);

    expect(refused.status).toBe(400);
    expect((refused.body as { details: unknown[] }).details.length).toBeGreaterThan(0);
  });

  it('[EF-VEI-02] reads the identifier with the rule of its own type', async () => {
    // The same value is a valid career page and an invalid Greenhouse slug.
    const page = {
      companyName: 'Atelier Aurore',
      adapter: 'generic',
      identifier: 'https://atelier-aurore.fr/jobs',
    };

    expect((await api(alice).add(page)).status).toBe(201);
    expect((await api(alice).add({ ...page, adapter: 'greenhouse' })).status).toBe(400);
  });

  it('[EF-VEI-03] refuses a source already watched, whatever the case of its identifier', async () => {
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);

    const again = await api(alice).add({ ...GREENHOUSE_SOURCE, identifier: 'AtelierAurore' });

    expect(again.status).toBe(409);
    expect((await api(alice).list()).body).toMatchObject({ items: [{ identifier: 'atelieraurore' }] });
  });

  it('[EF-VEI-04] suspends then reactivates a source', async () => {
    const { body } = await api(alice).add(GREENHOUSE_SOURCE);
    const { id } = body as { id: number };

    expect((await api(alice).update(id, { isActive: false })).body).toMatchObject({ isActive: false });
    expect((await api(alice).update(id, { isActive: true })).body).toMatchObject({ isActive: true });
  });

  it('[EF-VEI-05] removes a source, and its offers with it', async () => {
    await withServices({
      collect: boardCollector(GREENHOUSE_BOARD),
      aiProviders: scoringAi({ offers: [{ ref: 1, score: 80 }] }).providers,
    });
    await api(alice).saveProfile(DATA_PROFILE).expect(204);
    const { body } = await api(alice).add(GREENHOUSE_SOURCE);
    const { id } = body as { id: number };
    await api(alice).run().expect(200);
    expect(await database.db.select().from(jobOffers)).not.toHaveLength(0);

    expect((await api(alice).remove(id)).status).toBe(204);

    expect(await database.db.select().from(jobOffers)).toHaveLength(0);
    expect((await api(alice).list()).body).toEqual({ items: [] });
  });

  it('[EF-AUT-06] never shows nor touches the sources of another account', async () => {
    const bob = await registerUser(context.app, 'bob@example.com');
    const { body } = await api(alice).add(GREENHOUSE_SOURCE);
    const { id } = body as { id: number };

    expect((await api(bob).list()).body).toEqual({ items: [] });
    expect((await api(bob).update(id, { isActive: false })).status).toBe(404);
    expect((await api(bob).remove(id)).status).toBe(404);
    expect((await api(alice).list()).body).toMatchObject({ items: [{ isActive: true }] });
  });

  it('[EF-AUT-05] refuses every route without a session', async () => {
    expect((await request(context.app).get('/api/sites')).status).toBe(401);
    expect(
      (await request(context.app).post('/api/sites/run').set('Content-Type', 'application/json')).status,
    ).toBe(401);
  });
});

describe('one pass of the watch (EF-VEI-07 to EF-VEI-14)', () => {
  const runWithBoard = async (answer: unknown, board: unknown = GREENHOUSE_BOARD) => {
    const ai = scoringAi(answer);
    await withServices({ collect: boardCollector(board), aiProviders: ai.providers });
    await api(alice).saveProfile(DATA_PROFILE).expect(204);
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);
    return ai;
  };

  it('[EF-VEI-07] [EF-VEI-12] reads the source, scores the new offers and reports the pass', async () => {
    await runWithBoard({ offers: [{ ref: 1, score: 82, reason: 'Poste de data analyst en CDI.' }] });

    const report = await api(alice).run();

    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({
      sourcesChecked: 1,
      sourcesFailed: 0,
      offersFound: 2,
      offersNew: 2,
      offersRelevant: 1,
      threshold: 60,
    });
  });

  it('[EF-VEI-12] [EF-VEI-13] stores the score, its reason and the target matched', async () => {
    await runWithBoard({ offers: [{ ref: 1, score: 82, reason: 'Poste de data analyst en CDI.' }] });
    await api(alice).run().expect(200);

    const stored = await database.db.select().from(jobOffers).orderBy(jobOffers.externalId);

    expect(stored[0]).toMatchObject({
      title: 'Data Analyst',
      location: 'Paris',
      contractType: 'cdi',
      relevanceScore: 82,
      relevanceReason: 'Poste de data analyst en CDI.',
      matchedTarget: 'Data analyst',
    });
  });

  it('[EF-VEI-14] [RG-10] gives 5 without any AI call to an offer no target matches', async () => {
    const ai = await runWithBoard({ offers: [{ ref: 1, score: 82 }] });
    await api(alice).run().expect(200);

    const stored = await database.db.select().from(jobOffers).orderBy(jobOffers.externalId);
    const accountant = stored.find((offer) => offer.title === 'Comptable senior');

    expect(accountant).toMatchObject({ relevanceScore: 5, matchedTarget: null });
    expect(accountant?.relevanceReason).toContain('aucun mot-clé');
    // One batch for the one offer worth scoring, and nothing more.
    expect(ai.calls()).toBe(1);
  });

  it('[EF-VEI-21] gives every offer a contract type, « non précisé » when the source states none', async () => {
    await runWithBoard({ offers: [{ ref: 1, score: 70 }] });
    await api(alice).run().expect(200);

    const stored = await database.db.select().from(jobOffers).orderBy(jobOffers.externalId);

    expect(stored.map((offer) => offer.contractType)).toEqual(['cdi', 'non_precise']);
  });

  it('[EF-VEI-09] stores an offer once, whatever the number of passes', async () => {
    const ai = await runWithBoard({ offers: [{ ref: 1, score: 82 }] });
    await api(alice).run().expect(200);

    const second = await api(alice).run();

    expect(second.body).toMatchObject({ offersFound: 2, offersNew: 0 });
    expect(await database.db.select().from(jobOffers)).toHaveLength(2);
    // Nothing new means nothing to score: the second pass costs no AI call at all (ENF-COU-01).
    expect(ai.calls()).toBe(1);
  });

  it('[EF-VEI-10] records when each source was last checked', async () => {
    await runWithBoard({ offers: [{ ref: 1, score: 82 }] });

    await api(alice).run().expect(200);

    const [source] = await database.db.select().from(watchedSites);
    expect(source?.lastCheckedAt).toEqual(context.clock.now());
    expect(source?.lastError).toBeNull();
    expect((await api(alice).list()).body).toMatchObject({ items: [{ offerCount: 2 }] });
  });

  it('[EF-VEI-11] [ENF-FIA-02] keeps the failure of a source, and checks the others all the same', async () => {
    const ai = scoringAi({ offers: [{ ref: 1, score: 82 }] });
    const failing = vi.fn((url: string) =>
      Promise.resolve({
        url,
        status: url.includes('brise') ? 500 : 200,
        contentType: 'application/json',
        body: url.includes('brise') ? 'boom' : JSON.stringify(GREENHOUSE_BOARD),
      }),
    );
    await withServices({ collect: failing, aiProviders: ai.providers });
    await api(alice).saveProfile(DATA_PROFILE).expect(204);
    await api(alice).add({ companyName: 'Brise', adapter: 'greenhouse', identifier: 'brise' }).expect(201);
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);

    const report = await api(alice).run();

    expect(report.body).toMatchObject({ sourcesChecked: 1, sourcesFailed: 1, offersNew: 2 });
    const sources = await database.db.select().from(watchedSites).orderBy(watchedSites.identifier);
    expect(sources[0]?.lastError).toBeNull();
    expect(sources[1]?.lastError).toContain('500');
  });

  it('[EF-VEI-04] leaves a suspended source alone', async () => {
    await runWithBoard({ offers: [{ ref: 1, score: 82 }] });
    const [source] = await database.db.select().from(watchedSites);
    await api(alice)
      .update(source?.id ?? 0, { isActive: false })
      .expect(200);

    const report = await api(alice).run();

    expect(report.body).toMatchObject({ sourcesChecked: 0, offersNew: 0 });
    expect(await database.db.select().from(jobOffers)).toHaveLength(0);
  });

  it('[EF-VEI-07] asks for the profile before reading anything', async () => {
    await withServices({ collect: boardCollector(GREENHOUSE_BOARD) });
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);

    const refused = await api(alice).run();

    expect(refused.status).toBe(409);
    expect((refused.body as { error: string }).error).toContain('profil de référence');
  });

  it('[EF-VEI-07] answers an empty report when the candidate watches nothing', async () => {
    const report = await api(alice).run();

    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ sourcesChecked: 0, offersNew: 0 });
  });

  it('[EF-VEI-06] [ENF-FIA-02] runs the scheduled pass for every candidate who watches a source', async () => {
    const ai = scoringAi({ offers: [{ ref: 1, score: 82 }] });
    await withServices({ collect: boardCollector(GREENHOUSE_BOARD), aiProviders: ai.providers });
    const bob = await registerUser(context.app, 'bob@example.com');
    await api(alice).saveProfile(DATA_PROFILE).expect(204);
    await api(bob).saveProfile(DATA_PROFILE).expect(204);
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);
    await api(bob).add(GREENHOUSE_SOURCE).expect(201);

    await context.watch.checkEverySource();

    const offers = await database.db.select().from(jobOffers);
    // Each candidate has their own copy of the offers of their own source (EF-AUT-06).
    expect(offers).toHaveLength(4);
  });

  it('[ENF-FIA-02] finishes the scheduled pass even when a candidate has no profile', async () => {
    const ai = scoringAi({ offers: [{ ref: 1, score: 82 }] });
    await withServices({ collect: boardCollector(GREENHOUSE_BOARD), aiProviders: ai.providers });
    const bob = await registerUser(context.app, 'bob@example.com');
    await api(bob).saveProfile(DATA_PROFILE).expect(204);
    await api(alice).add(GREENHOUSE_SOURCE).expect(201);
    await api(bob).add(GREENHOUSE_SOURCE).expect(201);

    await expect(context.watch.checkEverySource()).resolves.toBeUndefined();

    const owned = await database.db
      .select()
      .from(jobOffers)
      .innerJoin(watchedSites, eq(watchedSites.id, jobOffers.siteId));
    expect(owned).toHaveLength(2);
  });
});
