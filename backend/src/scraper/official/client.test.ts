import { describe, expect, it, vi } from 'vitest';
import { InsecureUrlError, MAX_RESPONSE_BYTES, ResponseTooLargeError } from '../http.js';
import { createOfficialClient, type OfficialApi } from './client.js';

const API: OfficialApi = { name: 'API fictive', requestsPerSecond: 2 };

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

const answering = (...responses: (() => Response)[]) => {
  const requests: { url: string; init: RequestInit }[] = [];
  let next = 0;
  const fetchImpl = vi.fn((url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    const respond =
      responses[Math.min(next, responses.length - 1)] ?? (() => new Response('', { status: 500 }));
    next += 1;
    return Promise.resolve(respond());
  });
  return { requests, fetchImpl: fetchImpl as unknown as typeof fetch };
};

const ok =
  (body = '{"ok":true}') =>
  () =>
    new Response(body, { status: 200 });

describe('official API client (ENF-COL-05)', () => {
  it('[ENF-COL-05] reads an official API without asking its robots.txt, and says who calls', async () => {
    const service = answering(ok());
    const request = createOfficialClient({ contact: 'veille@example.com', fetchImpl: service.fetchImpl });

    const response = await request(API, 'https://api.example.fr/offres');

    expect(response).toMatchObject({ status: 200, body: '{"ok":true}' });
    expect(service.requests.map((sent) => sent.url)).toEqual(['https://api.example.fr/offres']);
    const headers = service.requests[0]?.init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe('Tracandi/1.0 (+veille@example.com)');
  });

  it('[ENF-COL-05] keeps at most the pace of its API', async () => {
    const service = answering(ok());
    const time = fakeTime();
    const request = createOfficialClient({ fetchImpl: service.fetchImpl, now: time.now, sleep: time.sleep });

    for (let call = 0; call < 5; call += 1) await request(API, 'https://api.example.fr/offres');

    // Two requests per second: five calls take at least two seconds.
    expect(time.elapsed()).toBeGreaterThanOrEqual(2000);
  });

  it('[ENF-COL-05] waits what a 429 asks for, then tries once more', async () => {
    const service = answering(() => new Response('', { status: 429, headers: { 'Retry-After': '3' } }), ok());
    const time = fakeTime();
    const request = createOfficialClient({ fetchImpl: service.fetchImpl, now: time.now, sleep: time.sleep });

    const response = await request(API, 'https://api.example.fr/offres');

    expect(response.status).toBe(200);
    expect(service.requests).toHaveLength(2);
    expect(time.elapsed()).toBeGreaterThanOrEqual(3000);
  });

  it('[ENF-COL-05] sends a form as an OAuth token request expects it', async () => {
    const service = answering(ok());
    const request = createOfficialClient({ fetchImpl: service.fetchImpl });

    await request(API, 'https://auth.example.fr/token', {
      form: { grant_type: 'client_credentials', scope: 'a b' },
    });

    const sent = service.requests[0]?.init;
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toBe('grant_type=client_credentials&scope=a+b');
    expect((sent?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
  });

  it('[ENF-COL-05] refuses anything but https', async () => {
    const request = createOfficialClient({ fetchImpl: answering(ok()).fetchImpl });

    await expect(request(API, 'http://api.example.fr/offres')).rejects.toBeInstanceOf(InsecureUrlError);
  });

  it('[ENF-COL-05] gives up past 3 MB', async () => {
    const request = createOfficialClient({
      fetchImpl: answering(ok('x'.repeat(MAX_RESPONSE_BYTES + 1))).fetchImpl,
    });

    await expect(request(API, 'https://api.example.fr/offres')).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
