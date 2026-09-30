import { createRateLimiter, type RateLimiter, type Sleep, wait } from '../../lib/rateLimiter.js';
import { InsecureUrlError, readBounded, REQUEST_TIMEOUT_MS } from '../http.js';

/**
 * An official API the watch calls, and the pace it keeps: at most half the rate the API publishes (ENF-COL-05).
 * Named here rather than in each caller, so that every call to one API shares one limiter.
 */
export interface OfficialApi {
  /** Stable name, used as the key of the limiter and in the messages shown to the candidate. */
  readonly name: string;
  readonly requestsPerSecond: number;
}

/** What an official API answered: its status, its headers and its text, bounded to 3 MB. */
export interface OfficialResponse {
  status: number;
  headers: Headers;
  body: string;
}

export interface OfficialRequestInit {
  method?: 'GET' | 'POST';
  headers?: Readonly<Record<string, string>>;
  /** Sent as `application/x-www-form-urlencoded` (an OAuth token request). */
  form?: Readonly<Record<string, string>>;
}

/**
 * Calls an official API. robots.txt, written for crawlers, does not apply to a documented API called under its
 * terms of use; everything else of the responsible client does (ENF-COL-05).
 * @throws InsecureUrlError on anything but https, ResponseTooLargeError past 3 MB, or the failure of the request.
 */
export type OfficialRequest = (
  api: OfficialApi,
  url: string,
  init?: OfficialRequestInit,
) => Promise<OfficialResponse>;

export interface OfficialClientDeps {
  /** Carried by the user agent when configured (ENF-COL-03 applies in spirit: an API owner can write to us). */
  contact?: string | null;
  /** Injected so that tests never reach the network (testing.md). */
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: Sleep;
}

const TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
/** A 429 without a readable `Retry-After` still waits this long before the single retry. */
const DEFAULT_RETRY_AFTER_MS = 2000;
const MAX_RETRY_AFTER_MS = 30_000;

/** The wait a 429 asks for, bounded: an API never holds the watch for more than 30 seconds. */
const retryAfterMs = (headers: Headers): number => {
  const seconds = Number(headers.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(seconds * MS_PER_SECOND, MAX_RETRY_AFTER_MS)
    : DEFAULT_RETRY_AFTER_MS;
};

/**
 * Client of the official job APIs: https only, one limiter per API at half its published rate, every call bounded
 * to 15 seconds and 3 MB, one retry after a 429 once the wait it asks for has passed.
 * @req ENF-COL-05
 */
export const createOfficialClient = ({
  contact = null,
  fetchImpl = fetch,
  now = Date.now,
  sleep = wait,
}: OfficialClientDeps = {}): OfficialRequest => {
  const userAgent = contact ? `Tracandi/1.0 (+${contact})` : 'Tracandi/1.0';
  const limiters = new Map<string, RateLimiter>();

  const limiterOf = (api: OfficialApi): RateLimiter => {
    const known = limiters.get(api.name);
    if (known) return known;
    const limiter = createRateLimiter({ unitsPerSecond: api.requestsPerSecond, now, sleep });
    limiters.set(api.name, limiter);
    return limiter;
  };

  const send = async (api: OfficialApi, url: URL, init: OfficialRequestInit): Promise<Response> => {
    await limiterOf(api).take(1);
    return fetchImpl(url.href, {
      method: init.method ?? (init.form ? 'POST' : 'GET'),
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
        ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...init.headers,
      },
      ...(init.form ? { body: new URLSearchParams(init.form).toString() } : {}),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  return async (api, url, init = {}) => {
    const parsed = URL.parse(url);
    if (!parsed || parsed.protocol !== 'https:') throw new InsecureUrlError(url);
    let response = await send(api, parsed, init);
    if (response.status === TOO_MANY_REQUESTS) {
      const pause = retryAfterMs(response.headers);
      await response.body?.cancel();
      limiterOf(api).pauseFor(pause);
      response = await send(api, parsed, init);
    }
    return {
      status: response.status,
      headers: response.headers,
      body: await readBounded(response, parsed.href),
    };
  };
};
