import { describe, expect, it, vi } from 'vitest';
import {
  createPoliteFetch,
  DisallowedByRobotsError,
  InsecureUrlError,
  MAX_RESPONSE_BYTES,
  MIN_DELAY_PER_HOST_MS,
  ResponseTooLargeError,
  USER_AGENT_PRODUCT,
} from './http.js';

const CONTACT = 'veille@example.com';

/** Virtual time: sleeping moves the clock forward, so a test never waits (testing.md). */
const fakeTime = () => {
  let current = 0;
  return {
    now: () => current,
    sleep: (ms: number) => {
      current += ms;
      return Promise.resolve();
    },
    elapsed: () => current,
  };
};

const page = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { 'Content-Type': 'text/html', ...headers } });

const notFound = () => new Response('', { status: 404 });

/** A service answering `robots.txt` then the pages, recording the requests it received. */
const server = (robots: string | Response, pages: Record<string, Response | (() => Response)> = {}) => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn((url: string | URL, init?: RequestInit) => {
    const address = String(url);
    requests.push({ url: address, init: init ?? {} });
    if (address.endsWith('/robots.txt')) {
      return Promise.resolve(typeof robots === 'string' ? page(robots) : robots.clone());
    }
    const answer = pages[address];
    if (!answer) return Promise.resolve(notFound());
    return Promise.resolve(typeof answer === 'function' ? answer() : answer.clone());
  });
  return { requests, fetchImpl: fetchImpl as unknown as typeof fetch };
};

const politeFetchOf = (service: ReturnType<typeof server>, time = fakeTime()) =>
  createPoliteFetch({ contact: CONTACT, fetchImpl: service.fetchImpl, now: time.now, sleep: time.sleep });

describe('createPoliteFetch — robots.txt (ENF-COL-01)', () => {
  it('[ENF-COL-01] refuses a path the site forbids', async () => {
    const service = server('User-agent: *\nDisallow: /private/');

    await expect(politeFetchOf(service)('https://carrieres.example/private/offres')).rejects.toBeInstanceOf(
      DisallowedByRobotsError,
    );
    // Nothing but robots.txt was asked for.
    expect(service.requests.map((request) => request.url)).toEqual(['https://carrieres.example/robots.txt']);
  });

  it('[ENF-COL-01] reads a path the site allows', async () => {
    const service = server('User-agent: *\nDisallow: /private/', {
      'https://carrieres.example/offres': page('<h1>Nos offres</h1>'),
    });

    const collected = await politeFetchOf(service)('https://carrieres.example/offres');

    expect(collected).toMatchObject({ status: 200, body: '<h1>Nos offres</h1>' });
  });

  it('[ENF-COL-01] reads robots.txt once per origin, not once per page', async () => {
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/a': page('a'),
      'https://carrieres.example/b': page('b'),
    });
    const politeFetch = politeFetchOf(service);

    await politeFetch('https://carrieres.example/a');
    await politeFetch('https://carrieres.example/b');

    expect(service.requests.filter((request) => request.url.endsWith('/robots.txt'))).toHaveLength(1);
  });

  it('[ENF-COL-01] treats a site without robots.txt as open', async () => {
    const service = server(notFound(), { 'https://carrieres.example/offres': page('libre') });

    expect((await politeFetchOf(service)('https://carrieres.example/offres')).body).toBe('libre');
  });

  it('[ENF-COL-01] treats a robots.txt the server cannot serve as a refusal', async () => {
    // RFC 9309: an unavailable robots.txt means complete disallow, never « help yourself ».
    const service = server(new Response('', { status: 503 }));

    await expect(politeFetchOf(service)('https://carrieres.example/offres')).rejects.toBeInstanceOf(
      DisallowedByRobotsError,
    );
  });

  it('[ENF-COL-01] obeys a rule written for Tracandi rather than the general one', async () => {
    const service = server(`User-agent: *\nAllow: /\n\nUser-agent: ${USER_AGENT_PRODUCT}\nDisallow: /offres`);

    await expect(politeFetchOf(service)('https://carrieres.example/offres')).rejects.toBeInstanceOf(
      DisallowedByRobotsError,
    );
  });
});

describe('createPoliteFetch — pace and identity (ENF-COL-02, ENF-COL-03)', () => {
  it('[ENF-COL-02] leaves at least 3 seconds between two requests to one host', async () => {
    const time = fakeTime();
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/a': page('a'),
      'https://carrieres.example/b': page('b'),
    });
    const politeFetch = politeFetchOf(service, time);

    await politeFetch('https://carrieres.example/a');
    const afterFirst = time.elapsed();
    await politeFetch('https://carrieres.example/b');

    expect(time.elapsed() - afterFirst).toBeGreaterThanOrEqual(MIN_DELAY_PER_HOST_MS);
  });

  it('[ENF-COL-02] paces each host on its own, without adding the wait of another', async () => {
    const time = fakeTime();
    const service = server('User-agent: *\nAllow: /', {
      'https://une.example/offres': page('une'),
      'https://autre.example/offres': page('autre'),
    });
    const politeFetch = politeFetchOf(service, time);

    await politeFetch('https://une.example/offres');
    const afterFirst = time.elapsed();
    await politeFetch('https://autre.example/offres');

    // The second host pays its own robots.txt then its page, never the wait owed to the first one.
    expect(time.elapsed() - afterFirst).toBe(MIN_DELAY_PER_HOST_MS);
  });

  it('[ENF-COL-03] names itself with a contact address on every request', async () => {
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/offres': page('offres'),
    });

    await politeFetchOf(service)('https://carrieres.example/offres');

    for (const request of service.requests) {
      const agent = new Headers(request.init.headers).get('User-Agent') ?? '';
      expect(agent).toContain(USER_AGENT_PRODUCT);
      expect(agent).toContain(CONTACT);
    }
  });

  it('[ENF-COL-03] refuses to be built without a contact address', () => {
    expect(() => createPoliteFetch({ contact: '  ' })).toThrow();
  });
});

const CHUNK_BYTES = 256 * 1024;

/** A response served chunk by chunk, counting the ones the client actually pulled. */
const streamed = (chunks: number) => {
  const pulled = { count: 0 };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled.count >= chunks) {
        controller.close();
        return;
      }
      pulled.count += 1;
      controller.enqueue(new Uint8Array(CHUNK_BYTES).fill('x'.charCodeAt(0)));
    },
  });
  return { pulled, response: new Response(body, { headers: { 'Content-Type': 'text/html' } }) };
};

describe('createPoliteFetch — bounds (ENF-COL-04)', () => {
  it('[ENF-COL-04] gives up on a response larger than 3 MB, without reading it whole', async () => {
    const oversized = streamed(64); // 16 MB if it were read whole
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/offres': () => oversized.response,
    });

    await expect(politeFetchOf(service)('https://carrieres.example/offres')).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
    // Stopped as soon as the limit was passed: the 3 MB, the chunk that crossed them, and the one the stream
    // had already prepared — never the sixteen megabytes on offer.
    expect(oversized.pulled.count).toBeLessThanOrEqual(MAX_RESPONSE_BYTES / CHUNK_BYTES + 2);
  });

  it('[ENF-COL-04] accepts a response just under the limit', async () => {
    const fitting = streamed(MAX_RESPONSE_BYTES / CHUNK_BYTES);
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/offres': () => fitting.response,
    });

    expect((await politeFetchOf(service)('https://carrieres.example/offres')).body).toHaveLength(
      MAX_RESPONSE_BYTES,
    );
  });

  it('[ENF-COL-04] bounds every request with a signal the caller can see', async () => {
    const service = server('User-agent: *\nAllow: /', {
      'https://carrieres.example/offres': page('offres'),
    });

    await politeFetchOf(service)('https://carrieres.example/offres');

    for (const request of service.requests) expect(request.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('createPoliteFetch — what is never collected', () => {
  it.each([
    ['http', 'http://carrieres.example/offres'],
    ['ftp', 'ftp://carrieres.example/offres'],
    ['file', 'file:///etc/passwd'],
  ])('[ENF-COL-01] [ENF-SEC-01] refuses a %s address', async (_case, url) => {
    const service = server('User-agent: *\nAllow: /');

    await expect(politeFetchOf(service)(url)).rejects.toBeInstanceOf(InsecureUrlError);
    expect(service.requests).toEqual([]);
  });

  it('[ENF-COL-01] refuses an address that is not one', async () => {
    const service = server('User-agent: *\nAllow: /');

    await expect(politeFetchOf(service)('pas une adresse')).rejects.toBeInstanceOf(InsecureUrlError);
  });
});
