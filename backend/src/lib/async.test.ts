import { describe, expect, it } from 'vitest';
import { createKeyedMutex, createSlots, mapWithConcurrency } from './async.js';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('mapWithConcurrency', () => {
  it('[ENF-PERF-02] keeps the order of the items whatever the order of completion', async () => {
    const delays = [30, 5, 15, 0];

    const results = await mapWithConcurrency(delays, 2, async (delay) => {
      await new Promise((done) => setTimeout(done, delay));
      return delay * 2;
    });

    expect(results).toEqual([60, 10, 30, 0]);
  });

  it('[ENF-PERF-02] never has more calls in flight than the limit', async () => {
    let inFlight = 0;
    let highest = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight += 1;
      highest = Math.max(highest, inFlight);
      await new Promise((done) => setTimeout(done, 1));
      inFlight -= 1;
    });

    expect(highest).toBe(3);
  });

  it('[ENF-FIA-03] rejects with the first failure and starts no call after it', async () => {
    const started: number[] = [];
    const firstDone = deferred();

    const run = mapWithConcurrency([1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      if (item === 1) {
        await firstDone.promise;
        return item;
      }
      throw new Error(`item ${item} failed`);
    });
    firstDone.resolve();

    await expect(run).rejects.toThrow('item 2 failed');
    expect(started).toEqual([1, 2]);
  });

  it('[ENF-PERF-02] returns an empty list without calling anything', async () => {
    expect(await mapWithConcurrency([], 4, () => Promise.reject(new Error('never called')))).toEqual([]);
  });
});

describe('createSlots', () => {
  it('[EF-EXE-06] never runs more tasks at once than the slots', async () => {
    const slots = createSlots(2);
    const gates = [deferred(), deferred(), deferred()];
    let inFlight = 0;
    let highest = 0;
    const task = (gate: ReturnType<typeof deferred>) => async () => {
      inFlight += 1;
      highest = Math.max(highest, inFlight);
      await gate.promise;
      inFlight -= 1;
    };

    const all = Promise.all(gates.map((gate) => slots.run(task(gate))));
    await Promise.resolve();
    expect(inFlight).toBe(2);
    for (const gate of gates) gate.resolve();
    await all;

    expect(highest).toBe(2);
  });

  it('[EF-EXE-06] starts the waiting tasks in the order they asked', async () => {
    const slots = createSlots(1);
    const started: number[] = [];

    await Promise.all(
      [1, 2, 3].map((rank) =>
        slots.run(async () => {
          started.push(rank);
          await new Promise((done) => setTimeout(done, 1));
        }),
      ),
    );

    expect(started).toEqual([1, 2, 3]);
  });

  it('[EF-EXE-06] frees the slot of a task that fails, and hands back its failure', async () => {
    const slots = createSlots(1);

    await expect(slots.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(await slots.run(() => Promise.resolve('next'))).toBe('next');
  });

  it('[EF-EXE-06] refuses a number of slots below 1', () => {
    expect(() => createSlots(0)).toThrow(RangeError);
  });
});

describe('createSlots, background tasks (review of the lot 10, EF-EXE-06)', () => {
  it('[EF-EXE-06] gives a free slot to a task that someone waits for before a background one that asked earlier', async () => {
    const slots = createSlots(1);
    const holder = deferred();
    const started: string[] = [];
    const running = slots.run(() => holder.promise);
    const background = slots.run(
      () => {
        started.push('background');
        return Promise.resolve();
      },
      { background: true },
    );
    const interactive = slots.run(() => {
      started.push('interactive');
      return Promise.resolve();
    });
    await Promise.resolve();

    holder.resolve();
    await Promise.all([running, background, interactive]);

    expect(started).toEqual(['interactive', 'background']);
  });

  it('[EF-EXE-06] keeps the order of asking among background tasks, and among the others', async () => {
    const slots = createSlots(1);
    const holder = deferred();
    const started: string[] = [];
    const task = (name: string) => () => {
      started.push(name);
      return Promise.resolve();
    };
    const all = [
      slots.run(() => holder.promise),
      slots.run(task('background 1'), { background: true }),
      slots.run(task('interactive 1')),
      slots.run(task('background 2'), { background: true }),
      slots.run(task('interactive 2')),
    ];

    holder.resolve();
    await Promise.all(all);

    expect(started).toEqual(['interactive 1', 'interactive 2', 'background 1', 'background 2']);
  });

  it('[EF-EXE-06] never starves a background task that waits alone: it runs as soon as a slot is free', async () => {
    const slots = createSlots(1);
    const ran: string[] = [];

    await slots.run(
      () => {
        ran.push('background');
        return Promise.resolve();
      },
      { background: true },
    );

    expect(ran).toEqual(['background']);
  });
});

describe('createKeyedMutex (review of the lot 10)', () => {
  it('[ENF-COU-01] runs the tasks of one key one after the other, in the order they asked', async () => {
    const exclusively = createKeyedMutex<number>();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`${name} starts`);
      await new Promise((done) => setTimeout(done, ms));
      events.push(`${name} ends`);
    };

    await Promise.all([
      exclusively(1, task('a', 15)),
      exclusively(1, task('b', 1)),
      exclusively(1, task('c', 1)),
    ]);

    expect(events).toEqual(['a starts', 'a ends', 'b starts', 'b ends', 'c starts', 'c ends']);
  });

  it('[ENF-COU-01] lets the tasks of other keys run at the same time', async () => {
    const exclusively = createKeyedMutex<number>();
    const gate = deferred();
    let second = false;

    const first = exclusively(1, () => gate.promise);
    await exclusively(2, () => {
      second = true;
      return Promise.resolve();
    });

    expect(second).toBe(true);
    gate.resolve();
    await first;
  });

  it('[ENF-COU-01] goes on with the next task when one fails, and hands the failure to its own caller', async () => {
    const exclusively = createKeyedMutex<number>();

    const failing = exclusively(1, () => Promise.reject(new Error('refused')));
    const next = exclusively(1, () => Promise.resolve('done'));

    await expect(failing).rejects.toThrow('refused');
    await expect(next).resolves.toBe('done');
  });
});
