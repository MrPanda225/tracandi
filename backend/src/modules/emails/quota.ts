import { createRateLimiter, type RateLimiter, type Sleep, wait } from '../../lib/rateLimiter.js';
import type { GmailClient } from './mailbox.js';

/**
 * Quota cost of each Gmail method used here, in units (Google, « Usage limits »). Gmail counts the cost of the
 * call, not its result: a listing of 500 ids costs the same as a listing of one.
 */
const COST = { list: 5, get: 5, listLabels: 1, createLabel: 5, modifyThread: 10 } as const;

/**
 * 80 % of the 250 units per second and per user Gmail grants (15 000 per minute): the moving average it measures
 * stays under the limit even when the reads run in parallel.
 */
export const GMAIL_UNITS_PER_SECOND = 200;

/** Attempts of one call, the first one included; four waits of 1, 2, 4 then 8 seconds at most. */
export const MAX_ATTEMPTS = 5;
const FIRST_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
const JITTER_MS = 1000;
const MS_PER_SECOND = 1000;
const RETRY_AFTER = 'retry-after';

const TOO_MANY_REQUESTS = 429;
const FORBIDDEN = 403;
const FIRST_SERVER_ERROR = 500;
// Reasons Gmail gives when the quota of the user or of the project is exhausted for the moment.
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

/** Reads a property of a value that may be anything: Gmail failures are external data (clean-code.md). */
const propertyOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/** HTTP status of a Gmail failure, reported by googleapis as `status` or `code`. */
const statusOf = (error: unknown): number | null => {
  const status = propertyOf(error, 'status') ?? propertyOf(error, 'code');
  return typeof status === 'number' ? status : null;
};

/** Reasons carried by a Gmail failure, at the top level or inside the answer. */
const reasonsOf = (error: unknown): string[] =>
  [
    propertyOf(error, 'errors'),
    propertyOf(propertyOf(propertyOf(propertyOf(error, 'response'), 'data'), 'error'), 'errors'),
  ]
    .filter((list): list is unknown[] => Array.isArray(list))
    .flat()
    .map((entry) => propertyOf(entry, 'reason'))
    .filter((reason): reason is string => typeof reason === 'string');

/**
 * True when Gmail refused the call because the quota is exhausted for the moment (429, or 403 with a rate limit
 * reason): the same call succeeds later, unlike a revoked authorisation or a deleted message.
 * @req ENF-FIA-03
 */
export const isRateLimited = (error: unknown): boolean => {
  const status = statusOf(error);
  if (status === TOO_MANY_REQUESTS) return true;
  return status === FORBIDDEN && reasonsOf(error).some((reason) => RATE_LIMIT_REASONS.has(reason));
};

/** A failure worth another attempt: the quota of the moment, or a Gmail outage (5xx). */
const isRetryable = (error: unknown): boolean => {
  const status = statusOf(error);
  return isRateLimited(error) || (status !== null && status >= FIRST_SERVER_ERROR);
};

/** The delay Gmail asks for in `Retry-After`, in milliseconds; null when it gives none. */
const retryAfterMs = (error: unknown): number | null => {
  const headers = propertyOf(propertyOf(error, 'response'), 'headers');
  const getHeader = propertyOf(headers, 'get');
  const value =
    typeof getHeader === 'function'
      ? (getHeader as (name: string) => unknown).call(headers, RETRY_AFTER)
      : propertyOf(headers, RETRY_AFTER);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const seconds = Number(value);
  // An HTTP date is not read: the backoff of the attempt applies instead.
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * MS_PER_SECOND, MAX_BACKOFF_MS) : null;
};

/** Exponential backoff with jitter (Google, « Exponential backoff »): 1, 2, 4 then 8 seconds, plus 0 to 1 second. */
const backoffMs = (attempt: number, random: () => number): number =>
  Math.min(FIRST_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS) + random() * JITTER_MS;

/** One call that had to be made again, for the journal of the synchronisation. */
export interface GmailRetry {
  /** Number of the failed attempt, starting at 1. */
  attempt: number;
  delayMs: number;
  error: unknown;
}

export interface GmailThrottleDeps {
  /** Spacing of the calls; a limiter at 200 units per second by default. */
  limiter?: RateLimiter;
  sleep?: Sleep;
  random?: () => number;
  onRetry?: (retry: GmailRetry) => void;
}

/**
 * Wraps a Gmail client so that its calls stay inside the quota of one user: they are spaced by their cost, and a
 * refusal for exhausted quota or a Gmail outage is attempted again with an exponential backoff. Any other failure
 * (message deleted, authorisation refused, invalid label) is raised as it is, at once.
 * @throws the last failure of the call once the attempts are spent; `isRateLimited` tells a quota refusal.
 * @req ENF-FIA-03, ENF-PERF-02
 */
export const throttleGmailClient = (client: GmailClient, deps: GmailThrottleDeps = {}): GmailClient => {
  const {
    limiter = createRateLimiter({ unitsPerSecond: GMAIL_UNITS_PER_SECOND }),
    sleep = wait,
    random = Math.random,
    onRetry,
  } = deps;

  const guard = async <T>(cost: number, call: () => Promise<T>): Promise<T> => {
    const once = async (): Promise<T> => {
      await limiter.take(cost);
      return call();
    };
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await once();
      } catch (error) {
        if (!isRetryable(error)) throw error;
        const delayMs = retryAfterMs(error) ?? backoffMs(attempt, random);
        onRetry?.({ attempt, delayMs, error });
        await sleep(delayMs);
      }
    }
    // Last attempt: its failure is the caller's.
    return once();
  };

  return {
    list: (params) => guard(COST.list, () => client.list(params)),
    get: (params) => guard(COST.get, () => client.get(params)),
    listLabels: (params) => guard(COST.listLabels, () => client.listLabels(params)),
    createLabel: (params) => guard(COST.createLabel, () => client.createLabel(params)),
    modifyThread: (params) => guard(COST.modifyThread, () => client.modifyThread(params)),
  };
};
