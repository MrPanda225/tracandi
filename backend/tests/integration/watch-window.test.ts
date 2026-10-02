import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobOffers, users, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
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
let search: ReturnType<typeof vi.fn<FranceTravailApi['search']>>;

const CRITERIA = {
  targets: [
    { label: 'Data analyst', keywords: ['data', 'statistiques'], contractTypes: ['cdi', 'alternance'] },
  ],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

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

/** The pass the candidate asks for, run to its end (through the service: a session would expire in 40 days). */
const checkNow = async () => {
  const [user] = await database.db.select({ id: users.id }).from(users).limit(1);
  const userId = user?.id ?? 0;
  const runId = await context.watch.checkNow(userId);
  await context.queue.drain();
  return context.queue.stateOf(userId, runId);
};

const source = async () => (await database.db.select().from(watchedSites))[0];
const daysAsked = () => search.mock.calls.map(([query]) => query.publieeDepuis);

beforeEach(async () => {
  await truncateAll(database);
  search = vi.fn<FranceTravailApi['search']>(() => Promise.resolve(FIXTURE.resultats));
  context = createTestContext(database, {
    aiProviders: { gemini: scoringAi },
    official: { franceTravail: { search } },
  });
  alice = await registerUser(context.app, 'alice@example.com');
  await send('put', '/api/watch/criteria', CRITERIA).expect(200);
  await send('post', '/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('window of a check (T-1004, RG-30)', () => {
  it('[EF-VEI-52] asks for a week at the first check, then for the time since the start of the last successful one', async () => {
    await checkNow();
    context.clock.advanceDays(2);
    await checkNow();

    expect(daysAsked()[0]).toBe('7');
    // Two days since the last successful check: the smallest period of the API that covers them is three days.
    expect(daysAsked().at(-1)).toBe('3');
  });

  it('[EF-VEI-53] a failed check does not advance the window: the next one covers the period of the failure too', async () => {
    await checkNow();
    const success = await source();
    context.clock.advanceDays(1);
    search.mockRejectedValueOnce(new Error('service unavailable'));
    const failed = await checkNow();
    context.clock.advanceDays(1);

    await checkNow();

    expect(failed).toMatchObject({ outcome: 'success', counters: { sources_checked: 0 } });
    // Two days since the last success, not one since the failure: nothing published in between is lost.
    expect(daysAsked().at(-1)).toBe('3');
    expect(success?.lastSuccessStartedAt).not.toBeNull();
  });

  it('[EF-VEI-10] [EF-VEI-53] keeps the failure on the source, with its date, and the start of the last success untouched', async () => {
    await checkNow();
    const before = await source();
    context.clock.advanceDays(1);
    search.mockRejectedValueOnce(new Error('service unavailable'));

    await checkNow();

    const after = await source();
    expect(after?.lastError).toBeTruthy();
    // Dates compared as they are: the failure is the later check, the success is the one that stays.
    expect(after).toMatchObject({ lastSuccessStartedAt: before?.lastSuccessStartedAt });
    expect(after?.lastCheckedAt).not.toEqual(before?.lastCheckedAt);
  });

  it('[EF-VEI-52] [RG-30] never asks for more than 31 days, however long ago the last success was', async () => {
    await checkNow();
    context.clock.advanceDays(40);

    await checkNow();

    expect(daysAsked().at(-1)).toBe('31');
  });

  it('[EF-VEI-09] [EF-VEI-53] records no offer twice when the periods overlap', async () => {
    await checkNow();
    const first = await database.db.select({ id: jobOffers.id }).from(jobOffers);
    search.mockRejectedValueOnce(new Error('service unavailable'));
    context.clock.advanceDays(1);
    await checkNow();
    context.clock.advanceDays(1);

    await checkNow();

    expect(await database.db.select({ id: jobOffers.id }).from(jobOffers)).toHaveLength(first.length);
  });

  it('[EF-VEI-52] stamps the start of a successful check, not its end', async () => {
    const startedAt = context.clock.now();

    await checkNow();

    expect((await source())?.lastSuccessStartedAt).toEqual(startedAt);
  });
});
