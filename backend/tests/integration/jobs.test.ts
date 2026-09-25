import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jobRuns, users } from '../../src/db/schema.js';
import { createJobQueue, INTERRUPTED, type JobQueue, type RunState } from '../../src/jobs/queue.js';
import { createLogger } from '../../src/lib/logger.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let queue: JobQueue;
let aliceId: number;

const silent = createLogger({ write: () => undefined });

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

/** A treatment the test releases when it wants, to observe the states while it runs. */
const controllable = () => {
  let release: (counters: Record<string, number>) => void = () => undefined;
  const done = new Promise<Record<string, number>>((resolve) => {
    release = resolve;
  });
  return { release, run: () => done };
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  await registerUser(context.app, 'alice@example.com');
  aliceId = await userIdOf('alice@example.com');
  queue = createJobQueue({ db: database.db, clock: context.clock.now, logger: silent });
});

afterAll(async () => {
  await database.close();
});

describe('createJobQueue', () => {
  it('[EF-EXE-01] hands back an identifier without waiting for the treatment', async () => {
    const work = controllable();

    const runId = await queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: work.run,
    });

    expect(runId).toBeGreaterThan(0);
    // The treatment has not finished, yet the caller already has its identifier and its state.
    expect(await queue.stateOf(aliceId, runId)).toMatchObject({
      outcome: expect.stringMatching(/queued|running/) as unknown as string,
    });
    work.release({ messages_read: 1 });
    await queue.drain();
  });

  it('[EF-EXE-02] runs the treatments of one candidate one after the other, in order, without losing any', async () => {
    const order: number[] = [];
    const runs = [1, 2, 3].map((rank) => ({
      rank,
      work: async () => {
        order.push(rank);
        await new Promise((done) => setTimeout(done, 5));
        return { messages_read: rank };
      },
    }));

    const ids = [];
    for (const { work } of runs) {
      ids.push(await queue.enqueue({ userId: aliceId, job: 'gmail_sync', trigger: 'manual', run: work }));
    }
    await queue.drain();

    expect(order).toEqual([1, 2, 3]);
    const journaled = await database.db
      .select({ id: jobRuns.id, outcome: jobRuns.outcome })
      .from(jobRuns)
      .where(eq(jobRuns.userId, aliceId))
      .orderBy(jobRuns.id);
    expect(journaled.map((run) => run.outcome)).toEqual(['success', 'success', 'success']);
    expect(journaled.map((run) => run.id)).toEqual(ids);
  });

  it('[EF-EXE-06] runs one treatment at a time on the whole server, in the order of the requests', async () => {
    await registerUser(context.app, 'bob@example.com');
    const bobId = await userIdOf('bob@example.com');
    const events: string[] = [];
    const work = (name: string) => async () => {
      events.push(`start ${name}`);
      await new Promise((done) => setTimeout(done, 5));
      events.push(`end ${name}`);
      return { messages_read: 1 };
    };

    await queue.enqueue({ userId: aliceId, job: 'gmail_sync', trigger: 'schedule', run: work('alice') });
    await queue.enqueue({ userId: bobId, job: 'gmail_sync', trigger: 'schedule', run: work('bob') });
    await queue.drain();

    expect(events).toEqual(['start alice', 'end alice', 'start bob', 'end bob']);
  });

  it('[EF-EXE-06] lets the treatments of two candidates overlap when the configuration allows two', async () => {
    await registerUser(context.app, 'bob@example.com');
    const bobId = await userIdOf('bob@example.com');
    const wider = createJobQueue({ db: database.db, clock: context.clock.now, logger: silent, maxConcurrentRuns: 2 });
    const events: string[] = [];
    const work = (name: string) => async () => {
      events.push(`start ${name}`);
      await new Promise((done) => setTimeout(done, 5));
      events.push(`end ${name}`);
      return { messages_read: 1 };
    };

    await wider.enqueue({ userId: aliceId, job: 'gmail_sync', trigger: 'schedule', run: work('alice') });
    await wider.enqueue({ userId: bobId, job: 'gmail_sync', trigger: 'schedule', run: work('bob') });
    await wider.drain();

    // Both started before either ended, in whichever order the database answered.
    expect(events.slice(0, 2).sort()).toEqual(['start alice', 'start bob']);
  });

  it('[EF-EXE-03] publishes the counters a treatment reports while it runs, then those it ends with', async () => {
    const work = controllable();
    const seen: RunState[] = [];
    const stop = queue.follow(aliceId, (state) => seen.push(state));

    const runId = await queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: async (report) => {
        report({ messages_read: 50 });
        return work.run();
      },
    });
    work.release({ messages_read: 200, messages_classified: 12 });
    await queue.drain();
    stop();

    expect(seen.map((state) => state.outcome)).toEqual(['queued', 'running', 'running', 'success']);
    expect(seen[2]?.counters).toEqual({ messages_read: 50 });
    expect((await queue.stateOf(aliceId, runId))?.counters).toEqual({
      messages_read: 200,
      messages_classified: 12,
    });
  });

  it('[ENF-FIA-01] journals a failure and goes on with the next treatment', async () => {
    const after: number[] = [];

    await queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: () => Promise.reject(new Error('Gmail injoignable')),
    });
    const second = await queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'schedule',
      run: () => {
        after.push(1);
        return Promise.resolve({});
      },
    });
    await queue.drain();

    expect(after).toEqual([1]);
    const [failed] = await database.db
      .select({ outcome: jobRuns.outcome, error: jobRuns.error })
      .from(jobRuns)
      .where(eq(jobRuns.userId, aliceId))
      .orderBy(jobRuns.id);
    expect(failed).toEqual({ outcome: 'failure', error: 'Gmail injoignable' });
    expect((await queue.stateOf(aliceId, second))?.outcome).toBe('success');
  });

  it('[EF-GML-18] writes off a scheduled treatment when one is already waiting', async () => {
    const work = controllable();
    await queue.enqueue({ userId: aliceId, job: 'gmail_sync', trigger: 'manual', run: work.run });

    const skipped = await queue.enqueueUnlessPending({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'schedule',
      run: () => Promise.resolve({}),
    });

    expect(skipped).toBeNull();
    work.release({});
    await queue.drain();
    const outcomes = await database.db
      .select({ outcome: jobRuns.outcome })
      .from(jobRuns)
      .where(eq(jobRuns.userId, aliceId))
      .orderBy(jobRuns.id);
    expect(outcomes.map((run) => run.outcome)).toEqual(['success', 'skipped']);
  });

  it('[EF-AUT-06] never shows the execution of another account', async () => {
    await registerUser(context.app, 'bob@example.com');
    const bobId = await userIdOf('bob@example.com');
    const runId = await queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: () => Promise.resolve({}),
    });
    await queue.drain();

    expect(await queue.stateOf(bobId, runId)).toBeNull();
    expect(await queue.stateOf(aliceId, runId)).not.toBeNull();
  });

  it('[EF-EXE-05] closes in failure what a stopped server left waiting or running', async () => {
    const work = controllable();
    const isRunning = new Promise<void>((resolve) => {
      const stop = queue.follow(aliceId, (state) => {
        if (state.outcome !== 'running') return;
        stop();
        resolve();
      });
    });
    await queue.enqueue({ userId: aliceId, job: 'gmail_sync', trigger: 'manual', run: work.run });
    // The server stops while the execution runs: its journal line says so before the restart.
    await isRunning;
    // A second queue, as after a restart: the executions of the journal are no longer running anywhere.
    const afterRestart = createJobQueue({ db: database.db, clock: context.clock.now, logger: silent });

    await afterRestart.closeInterrupted();

    const [run] = await database.db
      .select({ outcome: jobRuns.outcome, error: jobRuns.error })
      .from(jobRuns)
      .where(eq(jobRuns.userId, aliceId));
    expect(run).toEqual({ outcome: 'failure', error: INTERRUPTED });
    work.release({});
    await queue.drain();
  });
});

describe('GET /api/jobs/:id', () => {
  it('[EF-EXE-03] shows the state of an execution to its owner', async () => {
    const cookie = await registerUser(context.app, 'carol@example.com');
    const carolId = await userIdOf('carol@example.com');
    const runId = await context.queue.enqueue({
      userId: carolId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: () => Promise.resolve({ messages_read: 3 }),
    });
    await context.queue.drain();

    const response = await request(context.app)
      .get(`/api/jobs/${String(runId)}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: runId,
      job: 'gmail_sync',
      outcome: 'success',
      counters: { messages_read: 3 },
    });
  });

  it('[EF-AUT-06] answers 404 for an execution of another account', async () => {
    const cookie = await registerUser(context.app, 'dave@example.com');
    const runId = await context.queue.enqueue({
      userId: aliceId,
      job: 'gmail_sync',
      trigger: 'manual',
      run: () => Promise.resolve({}),
    });
    await context.queue.drain();

    expect(
      (
        await request(context.app)
          .get(`/api/jobs/${String(runId)}`)
          .set('Cookie', cookie)
      ).status,
    ).toBe(404);
  });

  it('[ENF-SEC-04] refuses an identifier that is not a number', async () => {
    const cookie = await registerUser(context.app, 'erin@example.com');

    expect((await request(context.app).get('/api/jobs/abc').set('Cookie', cookie)).status).toBe(400);
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await request(context.app).get('/api/jobs/1')).status).toBe(401);
  });
});
