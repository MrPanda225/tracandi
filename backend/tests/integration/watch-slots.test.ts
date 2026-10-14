import { readFileSync } from 'node:fs';
import { asc } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobOffers, jobRuns, users, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { FranceTravailApi } from '../../src/scraper/official/franceTravail.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  logInUser,
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
let bob: string;
let search: ReturnType<typeof vi.fn<FranceTravailApi['search']>>;
let aiDown: boolean;
let localDown: boolean;

const CRITERIA = {
  targets: [
    { label: 'Data analyst', keywords: ['data', 'statistiques'], contractTypes: ['cdi', 'alternance'] },
  ],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

/** The model of the test, local or hosted: it scores every offer it is given, unless it is down. */
const scoringAi = (name: 'local' | 'gemini'): LlmProvider => ({
  name,
  model: 'test',
  complete: ({ prompt }) => {
    if (aiDown || (name === 'local' && localDown)) return Promise.reject(new Error('model unreachable'));
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({
        offers: refs.map((ref) => ({ ref, score: 75, reason: 'Proche de vos cibles.' })),
      }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
});

const ALL_SLOTS = ['morning', 'noon', 'evening'];

/** The three o'clock of the watch, Paris time, on 22 September 2026 (summer time: UTC+2). */
const AT = {
  morning: new Date('2026-09-22T05:00:00.000Z'),
  noon: new Date('2026-09-22T11:00:00.000Z'),
  evening: new Date('2026-09-22T17:00:00.000Z'),
};

const as = (cookie: string) => ({
  get: (path: string) => request(context.app).get(path).set('Cookie', cookie),
  put: (path: string, body: unknown) =>
    request(context.app)
      .put(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  post: (path: string, body: unknown) =>
    request(context.app)
      .post(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
});

const automatic = (cookie: string, enabled: boolean, slots: readonly string[] = ALL_SLOTS) =>
  as(cookie).put('/api/watch/automatic', { enabled, slots });

/** The pass of the clock at a given o'clock, run to its end, as the scheduler starts it (EF-VEI-06). */
const scheduledPassAt = async (slot: keyof typeof AT) => {
  context.clock.set(AT[slot]);
  await context.watch.checkEverySource();
  await context.queue.drain();
};

/** What the journal holds of the scheduled passes: who, at which slot, with which outcome. */
const journal = async () => {
  const rows = await database.db.select().from(jobRuns).orderBy(asc(jobRuns.id));
  return rows
    .filter((row) => row.job === 'scraper' && row.slot !== null)
    .map((row) => ({ userId: row.userId, slot: row.slot, outcome: row.outcome, trigger: row.triggerType }));
};

const userIdOf = async (email: string) => {
  const rows = await database.db.select({ id: users.id, email: users.email }).from(users);
  return rows.find((row) => row.email === email)?.id ?? 0;
};

beforeEach(async () => {
  await truncateAll(database);
  aiDown = false;
  localDown = false;
  search = vi.fn<FranceTravailApi['search']>(() => Promise.resolve(FIXTURE.resultats));
  context = createTestContext(database, {
    aiProviders: { local: scoringAi('local'), gemini: scoringAi('gemini') },
    official: { franceTravail: { search } },
  });
  context.clock.set(AT.morning);
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
  await as(alice).put('/api/watch/criteria', CRITERIA).expect(200);
  await as(alice).post('/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('automatic watch settings (T-1008, EF-CFG-07)', () => {
  it('[EF-CFG-07] is off by default, with the three slots offered', async () => {
    const response = await as(alice).get('/api/watch/automatic').expect(200);

    expect(response.body).toEqual({ enabled: false, slots: ALL_SLOTS, lastSuccessAt: null, passes: [] });
  });

  it('[EF-CFG-07] activates the watch with the slots chosen, and gives them back', async () => {
    const saved = await automatic(alice, true, ['morning', 'evening']).expect(200);
    const read = await as(alice).get('/api/watch/automatic').expect(200);

    expect(saved.body).toMatchObject({ enabled: true, slots: ['morning', 'evening'] });
    expect(read.body).toMatchObject({ enabled: true, slots: ['morning', 'evening'] });
  });

  it('[EF-CFG-07] refuses an activation with no slot at all, and keeps what was saved', async () => {
    await automatic(alice, true, ['noon']).expect(200);

    await automatic(alice, true, []).expect(400);

    expect((await as(alice).get('/api/watch/automatic')).body).toMatchObject({
      enabled: true,
      slots: ['noon'],
    });
  });

  it('[EF-CFG-07] lets the candidate stop the watch, and keeps the slots for the day they restart it', async () => {
    await automatic(alice, true, ['noon']).expect(200);

    await automatic(alice, false, ['noon']).expect(200);

    expect((await as(alice).get('/api/watch/automatic')).body).toMatchObject({
      enabled: false,
      slots: ['noon'],
    });
  });

  it('[EF-CFG-07] refuses an unknown slot, and lists each slot once, in the order of the day', async () => {
    await automatic(alice, true, ['midnight']).expect(400);

    const saved = await automatic(alice, true, ['evening', 'morning', 'evening']).expect(200);

    expect((saved.body as { slots: string[] }).slots).toEqual(['morning', 'evening']);
  });

  it('[EF-AUT-06] asks for a session, and shows each candidate only their own settings', async () => {
    await request(context.app).get('/api/watch/automatic').expect(401);
    await request(context.app)
      .put('/api/watch/automatic')
      .send({ enabled: true, slots: ['noon'] })
      .expect(401);

    await automatic(alice, true, ['noon']).expect(200);

    expect((await as(bob).get('/api/watch/automatic')).body).toEqual({
      enabled: false,
      slots: ALL_SLOTS,
      lastSuccessAt: null,
      passes: [],
    });
  });
});

describe('passes by candidate and by slot (T-1008, EF-VEI-51)', () => {
  it('[EF-VEI-06] [EF-VEI-51] records three passes a day, one per slot, for a candidate who activated the watch', async () => {
    await automatic(alice, true).expect(200);

    await scheduledPassAt('morning');
    await scheduledPassAt('noon');
    await scheduledPassAt('evening');

    const aliceId = await userIdOf('alice@example.com');
    expect(await journal()).toEqual(
      ALL_SLOTS.map((slot) => ({ userId: aliceId, slot, outcome: 'success', trigger: 'schedule' })),
    );
  });

  it('[EF-VEI-51] records nothing for a candidate who did not activate the watch, and reads none of their sources', async () => {
    await automatic(alice, true).expect(200);
    await as(bob).put('/api/watch/criteria', CRITERIA).expect(200);
    await as(bob).post('/api/sites', { adapter: 'france_travail', identifier: 'criteres' }).expect(201);

    await scheduledPassAt('morning');

    const bobId = await userIdOf('bob@example.com');
    expect((await journal()).filter((pass) => pass.userId === bobId)).toEqual([]);
    const sources = await database.db
      .select({ userId: watchedSites.userId, lastCheckedAt: watchedSites.lastCheckedAt })
      .from(watchedSites);
    // Alice's source was read; Bob's, active and with criteria, was left alone.
    expect(sources.find((source) => source.userId === bobId)?.lastCheckedAt).toBeNull();
    expect(sources.find((source) => source.userId !== bobId)?.lastCheckedAt).not.toBeNull();
  });

  it('[EF-CFG-07] [EF-VEI-51] makes no 13 h pass for a candidate who unticked the noon slot', async () => {
    await automatic(alice, true, ['morning', 'evening']).expect(200);
    await automatic(bob, true).expect(200);
    await as(bob).put('/api/watch/criteria', CRITERIA).expect(200);

    await scheduledPassAt('morning');
    await scheduledPassAt('noon');
    await scheduledPassAt('evening');

    const aliceId = await userIdOf('alice@example.com');
    const bobId = await userIdOf('bob@example.com');
    const slotsOf = async (id: number) =>
      (await journal()).filter((pass) => pass.userId === id).map((p) => p.slot);
    expect(await slotsOf(aliceId)).toEqual(['morning', 'evening']);
    expect(await slotsOf(bobId)).toEqual(ALL_SLOTS);
  });

  it('[EF-CFG-07] stops the passes of a candidate who stops the watch', async () => {
    await automatic(alice, true).expect(200);
    await scheduledPassAt('morning');

    await automatic(alice, false).expect(200);
    await scheduledPassAt('noon');
    await scheduledPassAt('evening');

    expect((await journal()).map((pass) => pass.slot)).toEqual(['morning']);
  });

  it('[EF-VEI-42] [EF-VEI-51] records a pass even when no source is due, with nothing read', async () => {
    await automatic(alice, true).expect(200);

    await scheduledPassAt('morning');
    await scheduledPassAt('noon'); // Same offers again: the source is now spaced out by 8 hours (EF-VEI-42).
    await scheduledPassAt('evening');

    const evening = (await as(alice).get('/api/watch/automatic')).body as {
      passes: { slot: string; outcome: string; counters: Record<string, number> }[];
    };
    expect(evening.passes.map((pass) => pass.slot)).toEqual(ALL_SLOTS);
    expect(evening.passes[2]).toMatchObject({ outcome: 'success', counters: { sources_checked: 0 } });
  });

  it('[EF-VEI-07] keeps the pass the candidate asks for apart: it has no slot and is not one of the three', async () => {
    await automatic(alice, true).expect(200);
    const aliceId = await userIdOf('alice@example.com');

    const runId = await context.watch.checkNow(aliceId);
    await context.queue.drain();

    expect(await context.queue.stateOf(aliceId, runId)).toMatchObject({ outcome: 'success' });
    expect(await journal()).toEqual([]);
    expect((await as(alice).get('/api/watch/automatic')).body).toMatchObject({ passes: [] });
  });

  it('[EF-CFG-08] [EF-AUT-06] lists the passes of the day of the candidate, with their slot, state and counters, no one else’s', async () => {
    await automatic(alice, true).expect(200);
    await automatic(bob, true).expect(200);
    await as(bob).put('/api/watch/criteria', CRITERIA).expect(200);
    await scheduledPassAt('morning');

    const body = (await as(alice).get('/api/watch/automatic')).body as {
      passes: {
        slot: string;
        outcome: string;
        counters: Record<string, number>;
        finishedAt: string | null;
      }[];
    };

    expect(body.passes).toHaveLength(1);
    expect(body.passes[0]).toMatchObject({
      slot: 'morning',
      outcome: 'success',
      counters: { sources_checked: 1 },
    });
    expect(body.passes[0]?.finishedAt).not.toBeNull();
    // No offer, no CV, no text of any kind in what the screen reads (ENF-RGP-12).
    expect(JSON.stringify(body)).not.toMatch(/Data analyst|alice@example/u);
  });

  it('[EF-CFG-08] shows only the passes of today', async () => {
    await automatic(alice, true).expect(200);
    await scheduledPassAt('morning');

    context.clock.advanceDays(1);
    alice = await logInUser(context.app, 'alice@example.com'); // EF-AUT-07: the session lasts 24 hours

    expect((await as(alice).get('/api/watch/automatic')).body).toMatchObject({ passes: [] });
  });
});

describe('a candidate with nothing to search for (T-1008, EF-VEI-55)', () => {
  it('[EF-VEI-55] ignores the pass, reads no source and tells why in the settings', async () => {
    // Bob activates his watch before having saved any criteria nor profile.
    await automatic(bob, true).expect(200);

    await scheduledPassAt('morning');

    const bobId = await userIdOf('bob@example.com');
    expect((await journal()).filter((pass) => pass.userId === bobId)).toEqual([
      { userId: bobId, slot: 'morning', outcome: 'skipped', trigger: 'schedule' },
    ]);
    expect(search).not.toHaveBeenCalled();
    const { passes } = (await as(bob).get('/api/watch/automatic')).body as {
      passes: { slot: string; outcome: string; message: string | null }[];
    };
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ slot: 'morning', outcome: 'skipped' });
    expect(passes[0]?.message).toContain('critères de recherche');
  });

  it('[EF-VEI-55] does not let the candidate without criteria stop the pass of another', async () => {
    await automatic(alice, true).expect(200);
    await automatic(bob, true).expect(200);

    await scheduledPassAt('morning');

    const aliceId = await userIdOf('alice@example.com');
    const outcomes = await journal();
    expect(outcomes.find((pass) => pass.userId === aliceId)).toMatchObject({ outcome: 'success' });
    expect(outcomes).toHaveLength(2);
  });
});

describe('a pass still running at the next slot (T-1008, EF-EXE-08)', () => {
  it('[EF-EXE-08] ignores the 13 h pass while the 7 h one runs: one line « ignoré », no second pass at once', async () => {
    await automatic(alice, true).expect(200);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    search.mockImplementation(async () => {
      await gate;
      return FIXTURE.resultats;
    });
    context.clock.set(AT.morning);
    await context.watch.checkEverySource();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));

    context.clock.set(AT.noon);
    await context.watch.checkEverySource();
    // A second pass beside the first would read the source at once: the first one is still held on its first call.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(search).toHaveBeenCalledTimes(1);
    release();
    await context.queue.drain();

    const aliceId = await userIdOf('alice@example.com');
    expect(await journal()).toEqual([
      { userId: aliceId, slot: 'morning', outcome: 'success', trigger: 'schedule' },
      { userId: aliceId, slot: 'noon', outcome: 'skipped', trigger: 'schedule' },
    ]);
  });

  it('[EF-EXE-08] [EF-VEI-54] takes up at 19 h the backlog even when no source is due: the source was read at 13 h and is spaced out until 21 h', async () => {
    await automatic(alice, true).expect(200);
    aiDown = true;
    await scheduledPassAt('morning');
    await scheduledPassAt('noon'); // Same offers again: the source is now spaced out by 8 hours (EF-VEI-42).
    const waiting = await database.db.select({ score: jobOffers.relevanceScore }).from(jobOffers);
    expect(waiting.some((offer) => offer.score === null)).toBe(true);
    aiDown = false;

    await scheduledPassAt('evening');

    const scored = await database.db.select({ score: jobOffers.relevanceScore }).from(jobOffers);
    expect(scored.every((offer) => offer.score !== null)).toBe(true);
    const { passes } = (await as(alice).get('/api/watch/automatic')).body as {
      passes: { slot: string; counters: Record<string, number> }[];
    };
    // Nothing was read at 19 h, and the pass says what it did: the offers it could score, none left waiting.
    expect(passes.find((pass) => pass.slot === 'evening')?.counters).toMatchObject({
      sources_checked: 0,
      offers_unscored: 0,
    });
  });

  it('[EF-EXE-08] [EF-VEI-54] takes up at 19 h the offers the morning could not score', async () => {
    await automatic(alice, true).expect(200);
    aiDown = true;
    await scheduledPassAt('morning');
    const waiting = await database.db.select({ score: jobOffers.relevanceScore }).from(jobOffers);
    // What carries no keyword of a target is set aside with a score (RG-10); the others wait for a model.
    expect(waiting.some((offer) => offer.score === null)).toBe(true);

    aiDown = false;
    await scheduledPassAt('evening');

    const scored = await database.db.select({ score: jobOffers.relevanceScore }).from(jobOffers);
    expect(scored.every((offer) => offer.score !== null)).toBe(true);
    const evening = (await as(alice).get('/api/watch/automatic')).body as {
      passes: { slot: string; counters: Record<string, number> }[];
    };
    expect(evening.passes.find((pass) => pass.slot === 'evening')?.counters).toMatchObject({
      offers_unscored: 0,
    });
  });
});

describe('which model led the pass, and when the last one succeeded (T-1014, EF-CFG-08, EF-CFG-09)', () => {
  interface Read {
    lastSuccessAt: string | null;
    passes: { slot: string; ledBy: string | null; counters: Record<string, number> }[];
  }
  const read = async () => (await as(alice).get('/api/watch/automatic').expect(200)).body as Read;

  it('[EF-CFG-09] says the local model led a pass it scored with', async () => {
    await automatic(alice, true).expect(200);

    await scheduledPassAt('morning');

    expect((await read()).passes[0]).toMatchObject({ slot: 'morning', ledBy: 'local' });
  });

  it('[EF-CFG-09] says « fallback » when the local model could not answer and a hosted provider did', async () => {
    await automatic(alice, true).expect(200);
    localDown = true;

    await scheduledPassAt('morning');

    expect((await read()).passes[0]).toMatchObject({ ledBy: 'fallback' });
  });

  it('[EF-CFG-09] says nothing of a pass that asked no model: nothing new to score, nothing to read', async () => {
    await automatic(alice, true).expect(200);
    await scheduledPassAt('morning');
    await scheduledPassAt('noon');
    await scheduledPassAt('evening');

    const { passes } = await read();

    // The morning scored the new offers; the next two found nothing more to ask a model about.
    expect(passes.map((pass) => pass.ledBy)).toEqual(['local', null, null]);
  });

  it('[EF-CFG-09] says nothing of a pass that was ignored', async () => {
    await automatic(bob, true).expect(200);

    await scheduledPassAt('morning');

    expect((await as(bob).get('/api/watch/automatic').expect(200)).body).toMatchObject({
      passes: [{ outcome: 'skipped', ledBy: null }],
    });
  });

  it('[EF-CFG-09] [ENF-SEC-25] never shows an address, a token nor the name of a model', async () => {
    await automatic(alice, true).expect(200);
    await scheduledPassAt('morning');

    const text = JSON.stringify(await read());

    expect(text).not.toMatch(/https?:|192\.168|token|baseUrl|apiKey|local-test|gemini-test/iu);
  });

  it('[EF-CFG-08] gives the date of the last successful pass, whichever day it was', async () => {
    await automatic(alice, true).expect(200);
    expect((await read()).lastSuccessAt).toBeNull();

    await scheduledPassAt('morning');
    const first = (await read()).lastSuccessAt;
    context.clock.advanceDays(3);
    alice = await logInUser(context.app, 'alice@example.com'); // EF-AUT-07: the session lasts 24 hours

    expect(first).not.toBeNull();
    // Three days later nothing ran: the passes of the day are none, the last success is still the morning's.
    expect((await read()).passes).toEqual([]);
    expect((await read()).lastSuccessAt).toBe(first);
  });

  it('[EF-CFG-08] leaves an ignored pass, a failed one and the pass the candidate asked for out of the last success', async () => {
    await automatic(alice, true).expect(200);
    const aliceId = await userIdOf('alice@example.com');
    await context.watch.checkNow(aliceId);
    await context.queue.drain();
    expect((await read()).lastSuccessAt).toBeNull();

    await automatic(bob, true).expect(200);
    await scheduledPassAt('morning');
    expect((await as(bob).get('/api/watch/automatic').expect(200)).body).toMatchObject({
      lastSuccessAt: null,
    });
  });

  it('[EF-CFG-08] counts the calls to a model by kind, without any content', async () => {
    await automatic(alice, true).expect(200);

    await scheduledPassAt('morning');

    const { passes } = await read();
    expect(passes[0]?.counters).toMatchObject({ model_calls_local: 1 });
    expect(passes[0]?.counters['model_calls_fallback']).toBeUndefined();
  });
});
