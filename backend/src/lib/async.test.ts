import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './async.js';

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
