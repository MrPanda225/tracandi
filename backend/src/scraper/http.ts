import * as robots from 'robots-parser';
import { createRateLimiter, type RateLimiter, type Sleep, wait } from '../lib/rateLimiter.js';

/**
 * The part of `robots-parser` used here. Its own typings declare the module twice, so they resolve to `any` under
 * this configuration: the shape is stated once, at the boundary, rather than spread through the file (clean-code.md).
 */
interface RobotsRules {
  isAllowed: (url: string, userAgent?: string) => boolean | undefined;
}
const parseRobots = robots.default as unknown as (url: string, contents: string) => RobotsRules;

/** ENF-COL-03: the product name Tracandi answers to, in its user agent and in the rules of a robots.txt. */
export const USER_AGENT_PRODUCT = 'TracandiBot';
/** ENF-COL-02: two requests to the same host are at least this far apart. */
export const MIN_DELAY_PER_HOST_MS = 3000;
/** ENF-COL-04 */
export const REQUEST_TIMEOUT_MS = 15_000;
/** ENF-COL-04 */
export const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;

const MS_PER_SECOND = 1000;
const REQUESTS_PER_SECOND_PER_HOST = MS_PER_SECOND / MIN_DELAY_PER_HOST_MS;
const HTTPS = 'https:';
const ROBOTS_PATH = '/robots.txt';
const FIRST_SERVER_ERROR = 500;
const NOT_FOUND = 404;

/** The address is not an https one: nothing else is ever collected (ENF-COL-01, rules/scraping.md). */
export class InsecureUrlError extends Error {
  constructor(url: string) {
    super(`Only https addresses are collected, got « ${url} »`);
    this.name = 'InsecureUrlError';
  }
}

/** ENF-COL-01: the robots.txt of the site forbids this address to Tracandi. */
export class DisallowedByRobotsError extends Error {
  constructor(url: string) {
    super(`robots.txt forbids « ${url} »`);
    this.name = 'DisallowedByRobotsError';
  }
}

/** ENF-COL-04: the response went past 3 MB; it is abandoned instead of being held in memory. */
export class ResponseTooLargeError extends Error {
  constructor(url: string) {
    super(`« ${url} » answered more than ${MAX_RESPONSE_BYTES} bytes`);
    this.name = 'ResponseTooLargeError';
  }
}

/** A page collected from a watched site: its address after redirections, its status and its text. */
export interface CollectedPage {
  url: string;
  status: number;
  contentType: string | null;
  body: string;
}

export interface PoliteFetchDeps {
  /** ENF-COL-03: address a site owner can write to, carried by every request. */
  contact: string;
  /** Injected so that tests never reach the network (testing.md). */
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: Sleep;
}

/** Reads the body up to `maxBytes`, then gives up without holding more than that in memory (ENF-COL-04). */
const readBounded = async (response: Response, url: string): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  let chunk = await reader.read();
  while (!chunk.done) {
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ResponseTooLargeError(url);
    }
    chunks.push(chunk.value);
    chunk = await reader.read();
  }
  const whole = new Uint8Array(size);
  let at = 0;
  for (const part of chunks) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(whole);
};

/** The https address of `url`, or the refusal to collect anything else. @throws InsecureUrlError */
const secureUrlOf = (url: string): URL => {
  const parsed = URL.parse(url);
  if (!parsed || parsed.protocol !== HTTPS) throw new InsecureUrlError(url);
  return parsed;
};

/**
 * Responsible HTTP client of the offers watch: https only, robots.txt obeyed, one request every three seconds per
 * host, an identified user agent, and every request bounded to 15 seconds and 3 MB.
 * @throws InsecureUrlError, DisallowedByRobotsError, ResponseTooLargeError, or the failure of the request itself.
 * @req ENF-COL-01, ENF-COL-02, ENF-COL-03, ENF-COL-04
 */
export const createPoliteFetch = ({
  contact,
  fetchImpl = fetch,
  now = Date.now,
  sleep = wait,
}: PoliteFetchDeps): ((url: string) => Promise<CollectedPage>) => {
  if (contact.trim() === '') throw new Error('A contact address is required (ENF-COL-03)');
  const userAgent = `${USER_AGENT_PRODUCT}/1.0 (+${contact.trim()})`;
  // One limiter per host: a slow site never holds back the others (ENF-COL-02).
  const limiters = new Map<string, RateLimiter>();
  const robotsByOrigin = new Map<string, Promise<RobotsRules | null>>();

  const limiterOf = (host: string): RateLimiter => {
    const known = limiters.get(host);
    if (known) return known;
    const limiter = createRateLimiter({ unitsPerSecond: REQUESTS_PER_SECOND_PER_HOST, now, sleep });
    limiters.set(host, limiter);
    return limiter;
  };

  const request = async (url: URL): Promise<Response> => {
    await limiterOf(url.host).take(1);
    return fetchImpl(url.href, {
      headers: { 'User-Agent': userAgent, Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' },
      redirect: 'follow',
      // ENF-COL-04: a site that never answers must not hold the watch.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  };

  /**
   * The rules of an origin, read once. A robots.txt the server cannot serve means complete disallow (RFC 9309);
   * one it does not have (404) means no rule at all.
   */
  const robotsOf = async (origin: string): Promise<RobotsRules | null> => {
    const address = `${origin}${ROBOTS_PATH}`;
    const response = await request(new URL(address));
    if (response.status >= FIRST_SERVER_ERROR) return parseRobots(address, 'User-agent: *\nDisallow: /');
    if (response.status === NOT_FOUND || !response.ok) return null;
    return parseRobots(address, await readBounded(response, address));
  };

  const isAllowed = async (url: URL): Promise<boolean> => {
    const known = robotsByOrigin.get(url.origin);
    const rules = await (known ?? robotsByOrigin.set(url.origin, robotsOf(url.origin)).get(url.origin));
    return rules?.isAllowed(url.href, USER_AGENT_PRODUCT) ?? true;
  };

  return async (url) => {
    const parsed = secureUrlOf(url);
    if (!(await isAllowed(parsed))) throw new DisallowedByRobotsError(url);
    const response = await request(parsed);
    return {
      url: response.url || parsed.href,
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      body: await readBounded(response, parsed.href),
    };
  };
};
