import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimiter.js';

/** Virtual time: sleeping moves the clock forward, so a test never waits (testing.md). */
const fakeTime = () => {
  let current = 0;
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms;
      return Promise.resolve();
    },
    advance: (ms: number) => {
      current += ms;
    },
    elapsed: () => current,
  };
};

describe('createRateLimiter', () => {
  it('[ENF-PERF-02] spaces the calls at the cost they consume', async () => {
    const time = fakeTime();
    const limiter = createRateLimiter({ unitsPerSecond: 200, now: time.now, sleep: time.sleep });

    for (let call = 0; call < 4; call += 1) await limiter.take(5);

    // 5 units at 200 units per second = 25 ms each; the first one is free.
    expect(time.elapsed()).toBe(75);
  });

  it('[ENF-PERF-02] lets a call through at once when the allowance has recovered', async () => {
    const time = fakeTime();
    const limiter = createRateLimiter({ unitsPerSecond: 200, now: time.now, sleep: time.sleep });

    await limiter.take(10);
    time.advance(1000);
    await limiter.take(10);

    expect(time.elapsed()).toBe(1000);
  });

  it('[ENF-PERF-02] serves concurrent calls in the order they were asked', async () => {
    const time = fakeTime();
    const limiter = createRateLimiter({ unitsPerSecond: 100, now: time.now, sleep: time.sleep });
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map(async (call) => {
        await limiter.take(10);
        order.push(call);
      }),
    );

    expect(order).toEqual([1, 2, 3]);
    expect(time.elapsed()).toBe(200);
  });

  it('[ENF-FIA-09] holds every later call back for the pause asked for', async () => {
    const time = fakeTime();
    const limiter = createRateLimiter({ unitsPerSecond: 200, now: time.now, sleep: time.sleep });

    limiter.pauseFor(30_000);
    await Promise.all([limiter.take(5), limiter.take(5)]);

    expect(time.elapsed()).toBe(30_025);
  });

  it('[ENF-PERF-02] refuses a rate that would never let a call through', () => {
    expect(() => createRateLimiter({ unitsPerSecond: 0 })).toThrow();
  });
});
