import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../../src/db/schema.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let ids: { alice: number; bob: number; carol: number };

const idOf = async (email: string) => {
  const rows = await database.db.select({ id: users.id, email: users.email }).from(users);
  return rows.find((row) => row.email === email)?.id ?? 0;
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  await registerUser(context.app, 'alice@example.com');
  await registerUser(context.app, 'bob@example.com');
  await registerUser(context.app, 'carol@example.com');
  ids = {
    alice: await idOf('alice@example.com'),
    bob: await idOf('bob@example.com'),
    carol: await idOf('carol@example.com'),
  };
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('what a candidate waits for, and what the clock starts (review of the lot 10, EF-EXE-06)', () => {
  it('[EF-EXE-06] starts the CV a candidate imports before the passes of the clock that were queued ahead of it', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started: string[] = [];
    const work = (
      who: { userId: number; trigger: 'schedule' | 'manual' },
      name: string,
      wait?: Promise<void>,
    ) => ({
      userId: who.userId,
      job: who.trigger === 'schedule' ? ('scraper' as const) : ('profile_deduction' as const),
      trigger: who.trigger,
      run: async () => {
        started.push(name);
        await wait;
        return {};
      },
    });
    // One slot on the whole server: Alice's pass holds it; Bob's pass is next; Carol asks for a CV to be read.
    await context.queue.enqueue(work({ userId: ids.alice, trigger: 'schedule' }, 'pass of Alice', gate));
    await context.queue.enqueue(work({ userId: ids.bob, trigger: 'schedule' }, 'pass of Bob'));
    await context.queue.enqueue(work({ userId: ids.carol, trigger: 'manual' }, 'CV of Carol'));

    release();
    await context.queue.drain();

    expect(started).toEqual(['pass of Alice', 'CV of Carol', 'pass of Bob']);
  });

  it('[EF-EXE-02] keeps the order of one candidate’s own executions, the clock’s or not', async () => {
    const started: string[] = [];
    const work = (trigger: 'schedule' | 'manual', name: string) => ({
      userId: ids.alice,
      job: 'scraper' as const,
      trigger,
      run: () => {
        started.push(name);
        return Promise.resolve({});
      },
    });

    await context.queue.enqueue(work('schedule', 'first'));
    await context.queue.enqueue(work('manual', 'second'));
    await context.queue.enqueue(work('schedule', 'third'));
    await context.queue.drain();

    expect(started).toEqual(['first', 'second', 'third']);
  });
});
