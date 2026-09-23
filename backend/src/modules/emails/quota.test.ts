import { describe, expect, it } from 'vitest';
import { createFakeGmail } from '../../../tests/fixtures/emails/fakeGmail.js';
import { MCDONALDS_ACKNOWLEDGEMENT } from '../../../tests/fixtures/emails/messages.js';
import { createRateLimiter, type RateLimiter } from '../../lib/rateLimiter.js';
import type { GmailClient } from './mailbox.js';
import { GMAIL_UNITS_PER_SECOND, isRateLimited, throttleGmailClient } from './quota.js';

/** Virtual time: sleeping moves the clock forward and is recorded, so a test never waits (testing.md). */
const fakeTime = () => {
  let current = 0;
  const sleeps: number[] = [];
  return {
    now: () => current,
    sleep: (ms: number) => {
      sleeps.push(ms);
      current += ms;
      return Promise.resolve();
    },
    sleeps,
    elapsed: () => current,
  };
};

/** A Gmail failure as googleapis reports it: HTTP status, and the reason inside the answer. */
const gmailError = (status: number, { reason, retryAfter }: { reason?: string; retryAfter?: string } = {}) =>
  Object.assign(new Error(`Quota exceeded for quota metric 'Total Query Cost' (${status})`), {
    status,
    response: {
      status,
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
      data: { error: { code: status, errors: reason === undefined ? [] : [{ reason, message: 'refusé' }] } },
    },
  });

/** Never spaces the calls, and records the cool-downs asked for: the retry tests read the backoff only. */
const noPacing = (): RateLimiter & { pauses: number[] } => {
  const pauses: number[] = [];
  return { take: () => Promise.resolve(), pauseFor: (ms) => pauses.push(ms), pauses };
};

/** A client whose reads fail `failures` times before answering like Gmail would. */
const failingReads = (client: GmailClient, failures: number, error: () => Error) => {
  let attempts = 0;
  return {
    attempts: () => attempts,
    client: {
      ...client,
      get: (params: Parameters<GmailClient['get']>[0]) => {
        attempts += 1;
        return attempts <= failures ? Promise.reject(error()) : client.get(params);
      },
    } satisfies GmailClient,
  };
};

const read = (client: GmailClient) =>
  client.get({ userId: 'me', id: MCDONALDS_ACKNOWLEDGEMENT.id ?? '', format: 'metadata' });

describe('throttleGmailClient — quota refusals', () => {
  it('[ENF-FIA-03] reads the message again after a refusal for exceeded quota', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 2, () => gmailError(429));
    const client = throttleGmailClient(gmail.client, {
      limiter: noPacing(),
      sleep: time.sleep,
      random: () => 0,
    });

    const { data } = await read(client);

    expect(data.id).toBe(MCDONALDS_ACKNOWLEDGEMENT.id);
    expect(gmail.attempts()).toBe(3);
    // Exponential backoff, without jitter here: 4 s then 8 s.
    expect(time.sleeps).toEqual([4000, 8000]);
  });

  it('[ENF-FIA-03] waits the delay Gmail asks for', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 1, () =>
      gmailError(429, { retryAfter: '30' }),
    );
    const client = throttleGmailClient(gmail.client, { limiter: noPacing(), sleep: time.sleep });

    await read(client);

    expect(time.sleeps).toEqual([30_000]);
  });

  it('[ENF-FIA-03] reads again a quota refusal answered as 403', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 1, () =>
      gmailError(403, { reason: 'userRateLimitExceeded' }),
    );
    const client = throttleGmailClient(gmail.client, {
      limiter: noPacing(),
      sleep: time.sleep,
      random: () => 0,
    });

    await read(client);

    expect(gmail.attempts()).toBe(2);
  });

  it('[ENF-FIA-03] gives up after the last attempt and reports a quota failure', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 99, () =>
      gmailError(429),
    );
    const retries: number[] = [];
    const client = throttleGmailClient(gmail.client, {
      limiter: noPacing(),
      sleep: time.sleep,
      random: () => 0,
      onRetry: ({ attempt }) => retries.push(attempt),
    });

    await expect(read(client)).rejects.toSatisfy(isRateLimited);
    expect(gmail.attempts()).toBe(5);
    expect(retries).toEqual([1, 2, 3, 4]);
    expect(time.sleeps).toEqual([4000, 8000, 16_000, 32_000]);
  });

  it('[ENF-FIA-09] holds the other calls of the mailbox back for as long as the refused one waits', async () => {
    const time = fakeTime();
    const limiter = noPacing();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 2, () => gmailError(429));
    const client = throttleGmailClient(gmail.client, { limiter, sleep: time.sleep, random: () => 0 });

    await read(client);

    // One refusal exhausts the quota of the whole mailbox, not of this call alone.
    expect(limiter.pauses).toEqual([4000, 8000]);
  });

  it('[ENF-FIA-03] reads again after a Gmail outage', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 1, () => gmailError(503));
    const client = throttleGmailClient(gmail.client, {
      limiter: noPacing(),
      sleep: time.sleep,
      random: () => 0,
    });

    await read(client);

    expect(gmail.attempts()).toBe(2);
  });

  it('[ENF-FIA-03] never reads again a message deleted since the listing', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 99, () =>
      gmailError(404),
    );
    const client = throttleGmailClient(gmail.client, { limiter: noPacing(), sleep: time.sleep });

    await expect(read(client)).rejects.toThrow();
    expect(gmail.attempts()).toBe(1);
    expect(time.sleeps).toEqual([]);
  });

  it('[Q-11] never retries an authorisation Google refuses', async () => {
    const time = fakeTime();
    const gmail = failingReads(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client, 99, () =>
      Object.assign(new Error('invalid_grant'), { status: 400 }),
    );
    const client = throttleGmailClient(gmail.client, { limiter: noPacing(), sleep: time.sleep });

    await expect(read(client)).rejects.toThrow('invalid_grant');
    expect(gmail.attempts()).toBe(1);
  });
});

describe('throttleGmailClient — pacing', () => {
  it('[ENF-PERF-02] spaces the Gmail calls by the quota they consume', async () => {
    const time = fakeTime();
    const fake = createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]);
    const client = throttleGmailClient(fake.client, {
      limiter: createRateLimiter({
        unitsPerSecond: GMAIL_UNITS_PER_SECOND,
        now: time.now,
        sleep: time.sleep,
      }),
    });

    // 4 reads (5 units each) and a listing (5 units): 25 units in all.
    await Promise.all([read(client), read(client), read(client), read(client)]);
    await client.list({ userId: 'me', q: 'after:1' });

    const spentUnits = 25;
    expect(time.elapsed()).toBeGreaterThanOrEqual(((spentUnits - 5) / GMAIL_UNITS_PER_SECOND) * 1000);
    // Under Gmail's 250 units per second and per user, jitter aside.
    expect(spentUnits / (time.elapsed() / 1000)).toBeLessThanOrEqual(250);
  });
});
