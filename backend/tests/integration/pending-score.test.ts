import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jobOffers, users } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
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
let board: { jobs: unknown[] };
let aiDown = false;
/** What the simulated model answers for: the first `answersFor` references only, or nothing at all. */
let answersFor: number | null = null;
let answersNothing = false;
/** Minutes the simulated model « takes » per call: the test clock moves by that much (ENF-PERF-09). */
let minutesPerCall = 0;
const prompts: string[] = [];

const job = (id: number, updatedAt = '2026-09-18T08:00:00Z') => ({
  id,
  title: `Data Analyst ${String(id)}`,
  absolute_url: `https://boards.greenhouse.io/atelieraurore/jobs/${String(id)}`,
  location: { name: 'Nanterre' },
  metadata: [],
  content: '&lt;p&gt;SQL.&lt;/p&gt;',
  updated_at: updatedAt,
});
const jobs = (count: number, firstId = 1) =>
  Array.from({ length: count }, (_unused, index) => job(firstId + index));

const collect: AdapterDeps['fetch'] = (url) =>
  Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(board) });

const scoringAi = (): LlmProvider => ({
  name: 'gemini',
  model: 'test',
  complete: ({ prompt }) => {
    prompts.push(prompt);
    if (minutesPerCall > 0) context.clock.advanceMinutes(minutesPerCall);
    if (aiDown) return Promise.reject(new Error('no model answers'));
    const asked = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    const refs = answersNothing ? [] : answersFor === null ? asked : asked.slice(0, answersFor);
    return Promise.resolve({
      text: JSON.stringify({ offers: refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' })) }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
});

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['data', 'analyst'], contractTypes: ['cdi'] }],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

const send = (path: string, body: unknown, method: 'post' | 'put' = 'post') => {
  const test = method === 'post' ? request(context.app).post(path) : request(context.app).put(path);
  return test
    .set('Cookie', alice)
    .set('Content-Type', 'application/json')
    .send(body as object);
};

const checkNow = async () => {
  const [user] = await database.db.select({ id: users.id }).from(users).limit(1);
  const userId = user?.id ?? 0;
  const runId = await context.watch.checkNow(userId);
  await context.queue.drain();
  return context.queue.stateOf(userId, runId);
};

const scores = async () =>
  (await database.db.select({ score: jobOffers.relevanceScore }).from(jobOffers)).map((row) => row.score);
const titlesInPrompt = (prompt: string) =>
  [...prompt.matchAll(/Intitulé : (Data Analyst \d+)/gu)].map((match) => match[1]);

const start = async (limits?: { maxScoredOffersPerPass?: number; maxPassMinutes?: number }) => {
  prompts.length = 0;
  aiDown = false;
  answersFor = null;
  answersNothing = false;
  minutesPerCall = 0;
  await truncateAll(database);
  context = createTestContext(database, {
    collect,
    aiProviders: { gemini: scoringAi() },
    ...(limits ? { watchLimits: limits } : {}),
  });
  alice = await registerUser(context.app, 'alice@example.com');
  await send('/api/watch/criteria', CRITERIA, 'put').expect(200);
  await send('/api/sites', {
    companyName: 'Atelier Aurore',
    adapter: 'greenhouse',
    identifier: 'atelieraurore',
  }).expect(201);
};

beforeEach(async () => {
  board = { jobs: jobs(12) };
  await start();
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('offers read but not scored (T-1005)', () => {
  it('[EF-VEI-54] [ENF-FIA-11] reads the sources and keeps every offer, without a score, when no model answers', async () => {
    aiDown = true;

    const state = await checkNow();

    expect(state).toMatchObject({
      outcome: 'success',
      counters: { sources_checked: 1, offers_new: 12, offers_relevant: 0, offers_unscored: 12 },
    });
    expect(await scores()).toEqual(Array.from({ length: 12 }, () => null));
  });

  it('[EF-VEI-54] scores them at the next pass, without recording an offer twice', async () => {
    aiDown = true;
    await checkNow();
    aiDown = false;

    const state = await checkNow();

    expect(state).toMatchObject({ counters: { offers_new: 0, offers_relevant: 12, offers_unscored: 0 } });
    expect(await scores()).toEqual(Array.from({ length: 12 }, () => 70));
  });

  it('[EF-VEI-16] lists the offers still waiting for a score after the scored ones', async () => {
    await start({ maxScoredOffersPerPass: 5 });
    await checkNow();

    const listed = await request(context.app).get('/api/offers').set('Cookie', alice);

    const items = (listed.body as { items: { relevanceScore: number | null }[] }).items;
    expect(items.map((item) => item.relevanceScore)).toEqual([
      ...Array.from({ length: 5 }, () => 70),
      ...Array.from({ length: 7 }, () => null),
    ]);
  });
});

describe('ceiling of scored offers per pass (EF-EXE-07)', () => {
  it('[EF-EXE-07] scores 20 of 35 offers by default and keeps the 15 others, scored at the next pass', async () => {
    board = { jobs: jobs(35) };
    await start();

    const first = await checkNow();
    expect(first).toMatchObject({ counters: { offers_new: 35, offers_unscored: 15 } });
    expect((await scores()).filter((score) => score === null)).toHaveLength(15);

    const second = await checkNow();
    expect(second).toMatchObject({ counters: { offers_new: 0, offers_unscored: 0 } });
    expect((await scores()).filter((score) => score === null)).toHaveLength(0);
  });

  it('[EF-EXE-07] lifts the ceiling when it is 0', async () => {
    board = { jobs: jobs(35) };
    await start({ maxScoredOffersPerPass: 0 });

    const state = await checkNow();

    expect(state).toMatchObject({ counters: { offers_new: 35, offers_unscored: 0 } });
  });
});

describe('order of scoring (RG-31)', () => {
  it('[RG-31] scores the offers that waited first, then the most recently published ones', async () => {
    board = {
      jobs: [job(1, '2026-09-10T08:00:00Z'), job(2, '2026-09-12T08:00:00Z'), job(3, '2026-09-11T08:00:00Z')],
    };
    await start();
    aiDown = true;
    await checkNow();
    aiDown = false;
    prompts.length = 0;
    context.clock.advanceMinutes(60);
    board = {
      jobs: [
        job(1, '2026-09-10T08:00:00Z'),
        job(2, '2026-09-12T08:00:00Z'),
        job(3, '2026-09-11T08:00:00Z'),
        job(4, '2026-09-20T08:00:00Z'),
        job(5, '2026-09-15T08:00:00Z'),
      ],
    };

    await checkNow();

    // The three that waited, the most recent of them first; then the two new ones, the most recent first.
    expect(titlesInPrompt(prompts[0] ?? '')).toEqual([
      'Data Analyst 2',
      'Data Analyst 3',
      'Data Analyst 1',
      'Data Analyst 4',
      'Data Analyst 5',
    ]);
  });
});

describe('duration of a pass (ENF-PERF-09)', () => {
  it('[ENF-PERF-09] stops scoring after 45 minutes, leaves the rest waiting and still ends successfully', async () => {
    board = { jobs: jobs(40) };
    await start({ maxScoredOffersPerPass: 0 });
    minutesPerCall = 30;

    const state = await checkNow();

    // Fifteen at a time: 0 min, 30 min, then 60 min: the third batch is not started.
    expect(prompts).toHaveLength(2);
    expect(state).toMatchObject({ outcome: 'success', counters: { offers_new: 40, offers_unscored: 10 } });
  });
});

describe('a model that does not score every offer it is given (review of the lot 10, EF-VEI-54)', () => {
  it('[EF-VEI-54] keeps waiting the offers the model skipped, and scores them at the next pass', async () => {
    answersFor = 3;

    const first = await checkNow();

    // Three scored; the nine others are not given a score they never got: they wait for the next pass.
    expect(first).toMatchObject({ counters: { offers_relevant: 3, offers_unscored: 9 } });
    expect((await scores()).filter((score) => score === null)).toHaveLength(9);
    answersFor = null;

    const second = await checkNow();

    expect(second).toMatchObject({ counters: { offers_new: 0, offers_unscored: 0 } });
    expect(await scores()).toEqual(Array.from({ length: 12 }, () => 70));
  });

  it('[EF-IA-03] refuses an answer that scores none of the offers of the batch, and leaves the batch waiting', async () => {
    answersNothing = true;

    const first = await checkNow();

    expect(first).toMatchObject({
      outcome: 'success',
      counters: { offers_relevant: 0, offers_unscored: 12 },
    });
    expect(await scores()).toEqual(Array.from({ length: 12 }, () => null));
    answersNothing = false;

    expect(await checkNow()).toMatchObject({ counters: { offers_unscored: 0 } });
    expect(await scores()).toEqual(Array.from({ length: 12 }, () => 70));
  });
});
