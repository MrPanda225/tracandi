import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jobOffers, users, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  logInUser,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;
let board: { jobs: unknown[] };
const prompts: string[] = [];

const job = (id: number, title: string, content = '&lt;p&gt;SQL.&lt;/p&gt;') => ({
  id,
  title,
  absolute_url: `https://boards.greenhouse.io/atelieraurore/jobs/${String(id)}`,
  location: { name: 'Nanterre' },
  metadata: [],
  content,
  updated_at: '2026-09-18T08:00:00Z',
});

const collect: AdapterDeps['fetch'] = (url) =>
  Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(board) });

const scoringAi: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: ({ prompt }) => {
    prompts.push(prompt);
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({ offers: refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' })) }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
};

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

const userId = async () => (await database.db.select({ id: users.id }).from(users).limit(1))[0]?.id ?? 0;

const checkNow = async () => {
  const accepted = await send('/api/sites/run', {});
  await context.queue.drain();
  return context.queue.stateOf(await userId(), (accepted.body as { runId: number }).runId);
};

/** The scheduled pass, as the scheduler starts it (EF-VEI-06). */
const scheduledPass = async () => {
  await context.watch.checkEverySource();
  await context.queue.drain();
};

const source = async () => (await database.db.select().from(watchedSites))[0];

beforeEach(async () => {
  prompts.length = 0;
  board = { jobs: [job(1, 'Data Analyst'), job(2, 'Data engineer')] };
  await truncateAll(database);
  context = createTestContext(database, { collect, aiProviders: { gemini: scoringAi } });
  alice = await registerUser(context.app, 'alice@example.com');
  await send('/api/watch/criteria', CRITERIA, 'put').expect(200);
  // EF-CFG-07: the pass of the clock only watches for a candidate who activated the watch.
  await send('/api/watch/automatic', { enabled: true, slots: ['morning', 'noon', 'evening'] }, 'put').expect(
    200,
  );
  await send('/api/sites', {
    companyName: 'Atelier Aurore',
    adapter: 'greenhouse',
    identifier: 'atelieraurore',
  }).expect(201);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('sparing collection (EF-VEI-41, EF-VEI-42)', () => {
  it('[EF-VEI-41] [EF-VEI-42] spaces the checks of a source that publishes the same offers, in any order', async () => {
    await checkNow();
    expect(await source()).toMatchObject({ unchangedChecks: 0, nextCheckAt: null });

    board = { jobs: [...board.jobs].reverse() };
    await checkNow();

    const after = await source();
    expect(after?.unchangedChecks).toBe(1);
    expect(after?.nextCheckAt?.getTime()).toBe((after?.lastCheckedAt?.getTime() ?? 0) + 8 * 60 * 60 * 1000);
  });

  it('[EF-VEI-42] leaves a source not due out of the scheduled pass, and reads it when the candidate asks', async () => {
    await checkNow();
    await checkNow();
    await checkNow();
    const checkedAt = (await source())?.lastCheckedAt;

    await scheduledPass();
    expect((await source())?.lastCheckedAt).toEqual(checkedAt);

    context.clock.advanceDays(1);
    alice = await logInUser(context.app, 'alice@example.com'); // EF-AUT-07: the session lasts 24 hours
    expect(await checkNow()).toMatchObject({ outcome: 'success', counters: { sources_checked: 1 } });
  });

  it('[EF-VEI-42] brings a source back to every pass as soon as a new offer appears', async () => {
    await checkNow();
    await checkNow();

    board = { jobs: [...board.jobs, job(3, 'Data scientist')] };
    await checkNow();

    expect(await source()).toMatchObject({ unchangedChecks: 0, nextCheckAt: null });
  });
});

describe('minimisation (ENF-RGP-09, ENF-RGP-10)', () => {
  it('[ENF-RGP-09] stores the text of an offer without the recruiter’s e-mail or phone, and never sends them to the AI', async () => {
    board = {
      jobs: [
        job(
          1,
          'Data Analyst',
          '&lt;p&gt;Écrivez à jeanne.fictive@exemple.test ou au 01 23 45 67 89.&lt;/p&gt;',
        ),
      ],
    };

    await checkNow();

    const [offer] = await database.db.select({ description: jobOffers.description }).from(jobOffers);
    expect(offer?.description).toBe('Écrivez à [adresse retirée] ou au [téléphone retiré].');
    expect(prompts.join('\n')).not.toContain('jeanne.fictive');
    expect(prompts.join('\n')).not.toContain('01 23 45 67 89');
  });

  it('[ENF-RGP-10] removes the offers set aside that their source stopped publishing 60 days ago, and keeps the others', async () => {
    board = {
      jobs: [
        job(1, 'Data Analyst'),
        job(2, 'Data engineer'),
        job(3, 'Data scientist'),
        job(4, 'Data manager'),
      ],
    };
    await checkNow();
    const ids = await database.db
      .select({ id: jobOffers.id, externalId: jobOffers.externalId })
      .from(jobOffers);
    const idOf = (externalId: string) => ids.find((row) => row.externalId === externalId)?.id ?? 0;
    await database.db
      .update(jobOffers)
      .set({ status: 'dismissed' })
      .where(eq(jobOffers.id, idOf('2')));
    await database.db
      .update(jobOffers)
      .set({ status: 'saved' })
      .where(eq(jobOffers.id, idOf('3')));

    // Offers 1, 2 and 3 leave the source; offer 4 is still published.
    board = { jobs: [job(4, 'Data manager')] };
    context.clock.advanceDays(61);
    alice = await logInUser(context.app, 'alice@example.com'); // EF-AUT-07: the session lasts 24 hours
    await checkNow();
    await scheduledPass();

    const kept = await database.db.select({ externalId: jobOffers.externalId }).from(jobOffers);
    expect(kept.map((row) => row.externalId).sort()).toEqual(['3', '4']);
  });
});
