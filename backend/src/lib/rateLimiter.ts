const MS_PER_SECOND = 1000;

/** Waits the given number of milliseconds; injected so that tests never wait (testing.md). */
export type Sleep = (ms: number) => Promise<void>;

export const wait: Sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export interface RateLimiterDeps {
  /** Budget granted per second, in the units the caller counts (Gmail quota units, requests, bytes…). */
  unitsPerSecond: number;
  /** Milliseconds since an arbitrary origin; `Date.now` by default. */
  now?: () => number;
  sleep?: Sleep;
}

export interface RateLimiter {
  /**
   * Resolves when `cost` units may be spent. Calls are reserved in the order they are made, so callers running
   * in parallel are spread instead of bursting; an idle period is not saved up for later.
   */
  take: (cost: number) => Promise<void>;
  /**
   * Holds every later call back for `ms`, whoever asks: one refusal from the service slows the whole client down
   * instead of the single call that was refused.
   */
  pauseFor: (ms: number) => void;
}

/**
 * Spreads calls over time so that their cost never exceeds `unitsPerSecond`, whatever their concurrency.
 * Reserving is synchronous: two concurrent `take` calls get two distinct slots, in the order they were made.
 * @throws RangeError when `unitsPerSecond` is not a positive number.
 * @req ENF-PERF-02, ENF-COL-02
 */
export const createRateLimiter = ({
  unitsPerSecond,
  now = Date.now,
  sleep = wait,
}: RateLimiterDeps): RateLimiter => {
  if (!(unitsPerSecond > 0)) throw new RangeError('unitsPerSecond must be a positive number');
  let nextFreeAt = Number.NEGATIVE_INFINITY;

  return {
    async take(cost) {
      const startAt = Math.max(now(), nextFreeAt);
      nextFreeAt = startAt + (cost / unitsPerSecond) * MS_PER_SECOND;
      const delay = startAt - now();
      if (delay > 0) await sleep(delay);
    },

    pauseFor(ms) {
      nextFreeAt = Math.max(nextFreeAt, now() + ms);
    },
  };
};
