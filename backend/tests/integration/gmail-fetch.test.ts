import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  appSettings,
  gmailAccounts,
  platforms,
  prefilterKeywords,
  processedMessages,
  users,
} from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import {
  createMessageFetcher,
  GmailNotConnectedError,
  MAX_MESSAGES_PER_PASS,
  SYNC_OVERLAP_MS,
} from '../../src/modules/emails/fetcher.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { DEFAULT_JOB_KEYWORDS } from '../../src/modules/emails/prefilter.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import {
  APEC_INNOVA,
  BANK_STATEMENT,
  LONG_NEWSLETTER,
  MCDONALDS_ACKNOWLEDGEMENT,
  OLD_SPONTANEOUS_APPLICATION,
  otherMessages,
  SENT_APPLICATION,
} from '../fixtures/emails/messages.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
const REFRESH_TOKEN = '1//refresh-token-of-alice';
const MAILBOX = [
  SENT_APPLICATION,
  MCDONALDS_ACKNOWLEDGEMENT,
  BANK_STATEMENT,
  APEC_INNOVA,
  OLD_SPONTANEOUS_APPLICATION,
  LONG_NEWSLETTER,
];
const DAY_MS = 24 * 60 * 60_000;

let context: TestContext;
let gmail: FakeGmail;
let openedWith: string[];
let aliceId: number;

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

const connectMailbox = async (userId: number) =>
  saveGmailAccount(database.db, {
    userId,
    emailAddress: 'alex.martin@example.com',
    refreshToken: encryptSecret(REFRESH_TOKEN, context.encryptionKey),
    connectedAt: context.clock.now(),
    resetSync: true,
  });

/**
 * EF-CFG-04: sets N, the period of the first synchronisation. The recorded mailbox spans more than the 30 days
 * read by default (EF-GML-05), so the scenarios about the whole mailbox ask for 120 days.
 */
const readBack = (userId: number, days: number) =>
  database.db.update(appSettings).set({ gmailLookbackDays: days }).where(eq(appSettings.userId, userId));

const newFetcher = () =>
  createMessageFetcher({
    db: database.db,
    openMailbox: (refreshToken) => {
      openedWith.push(refreshToken);
      return createGmailMailbox(gmail.client);
    },
    encryptionKey: context.encryptionKey,
    clock: context.clock.now,
  });

const processedRows = (userId: number) =>
  database.db
    .select({ id: processedMessages.gmailMessageId, outcome: processedMessages.outcome })
    .from(processedMessages)
    .where(eq(processedMessages.userId, userId))
    .orderBy(processedMessages.gmailMessageId);

/** The `after:` bound of the last search, as a date. */
const lastSearchSince = (): Date => {
  const query = gmail.listCalls.at(-1)?.q ?? '';
  const seconds = /after:(\d+)/.exec(query)?.[1];
  if (!seconds) throw new Error(`no after: in « ${query} »`);
  return new Date(Number(seconds) * 1000);
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  context.clock.set(new Date('2026-09-22T10:00:00.000Z'));
  await registerUser(context.app, 'alice@example.com');
  aliceId = await userIdOf('alice@example.com');
  gmail = createFakeGmail(MAILBOX);
  openedWith = [];
});

afterAll(async () => {
  await database.close();
});

describe('MessageFetcher — first synchronisation', () => {
  it('[EF-GML-05] reads back 30 days by default, the received and the sent messages, drafts excluded', async () => {
    await connectMailbox(aliceId);

    const result = await newFetcher().fetchNewMessages(aliceId);

    // Cahier v1.5: N is 30 days by default, no message older is processed.
    expect(lastSearchSince()).toEqual(new Date('2026-08-23T10:00:00.000Z'));
    expect(gmail.listCalls.at(-1)?.q).toContain('-in:drafts');
    expect(result.readCount).toBe(MAILBOX.length - 1);
    expect(result.retained.map((message) => message.gmailMessageId)).not.toContain(
      OLD_SPONTANEOUS_APPLICATION.id,
    );
    expect((await processedRows(aliceId)).map((row) => row.id)).not.toContain(OLD_SPONTANEOUS_APPLICATION.id);
    expect(result.retained.find((message) => message.gmailMessageId === SENT_APPLICATION.id)?.direction).toBe(
      'outbound',
    );
  });

  it('[EF-CFG-04] [EF-GML-05] with N = 120, processes the messages of the last 120 days', async () => {
    await connectMailbox(aliceId);
    await database.db
      .update(appSettings)
      .set({ gmailLookbackDays: 120 })
      .where(eq(appSettings.userId, aliceId));

    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(lastSearchSince()).toEqual(new Date(context.clock.now().getTime() - 120 * DAY_MS));
    expect(result.readCount).toBe(MAILBOX.length);
    expect(result.retained.map((message) => message.gmailMessageId)).toContain(
      OLD_SPONTANEOUS_APPLICATION.id,
    );
  });

  it('[ENF-SEC-02] opens the mailbox with the refresh token decrypted from the database', async () => {
    await connectMailbox(aliceId);

    await newFetcher().fetchNewMessages(aliceId);

    expect(openedWith).toEqual([REFRESH_TOKEN]);
  });

  it('[ENF-FIA-03] [ENF-PERF-02] reads one bounded pass and leaves the older messages to the next one', async () => {
    await connectMailbox(aliceId);
    await readBack(aliceId, 120);
    // Gmail's quota per minute and per user forbids reading a large mailbox in one go.
    for (const message of otherMessages(MAX_MESSAGES_PER_PASS)) gmail.deliver(message);
    const fetcher = newFetcher();

    const first = await fetcher.fetchNewMessages(aliceId);
    const second = await fetcher.fetchNewMessages(aliceId);

    expect(first.readCount).toBe(MAX_MESSAGES_PER_PASS);
    expect(first.hasMore).toBe(true);
    expect(second.readCount).toBe(MAILBOX.length);
    expect(second.hasMore).toBe(false);
    // No message is read twice: the first pass marked what it read as processed.
    expect(new Set(gmail.readIds).size).toBe(MAX_MESSAGES_PER_PASS + MAILBOX.length);
  });

  it('[ENF-FIA-09] keeps what it read when Gmail refuses the rest for quota, and leaves the rest to the next pass', async () => {
    await connectMailbox(aliceId);
    let reads = 0;
    const quotaRefusal = Object.assign(new Error('Quota exceeded for quota metric'), { status: 429 });
    const strict = { ...gmail.client };
    gmail.client.get = (params) => {
      reads += 1;
      return reads > 2 ? Promise.reject(quotaRefusal) : strict.get(params);
    };

    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(result.readCount).toBeGreaterThan(0);
    expect(result.readCount).toBeLessThan(MAILBOX.length);
    expect(result.hasMore).toBe(true);
  });

  it('[ENF-FIA-09] reports the refusal when Gmail let nothing be read at all', async () => {
    await connectMailbox(aliceId);
    gmail.client.get = () =>
      Promise.reject(Object.assign(new Error('Quota exceeded for quota metric'), { status: 429 }));

    await expect(newFetcher().fetchNewMessages(aliceId)).rejects.toThrow('Quota exceeded');
    expect(await processedRows(aliceId)).toEqual([]);
  });

  it('[EF-GML-04] refuses to synchronise without a connected mailbox', async () => {
    await expect(newFetcher().fetchNewMessages(aliceId)).rejects.toBeInstanceOf(GmailNotConnectedError);
    expect(gmail.listCalls).toEqual([]);
  });
});

describe('MessageFetcher — pre-filter (RG-10)', () => {
  it('[EF-GML-07] sets a bank message aside, marked processed, and never hands it to the classification', async () => {
    await connectMailbox(aliceId);

    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(result.retained.map((message) => message.gmailMessageId)).not.toContain(BANK_STATEMENT.id);
    expect(await processedRows(aliceId)).toEqual([{ id: BANK_STATEMENT.id, outcome: 'prefiltered' }]);
  });

  it('[RG-10] [EF-GML-10] keeps job messages, oldest first, with the platform of a platform sender', async () => {
    await connectMailbox(aliceId);
    await readBack(aliceId, 120);

    const { retained } = await newFetcher().fetchNewMessages(aliceId);

    expect(retained.map((message) => message.gmailMessageId)).toEqual([
      OLD_SPONTANEOUS_APPLICATION.id,
      SENT_APPLICATION.id,
      MCDONALDS_ACKNOWLEDGEMENT.id,
      APEC_INNOVA.id,
      LONG_NEWSLETTER.id,
    ]);
    const [apec] = await database.db
      .select({ id: platforms.id })
      .from(platforms)
      .where(eq(platforms.name, 'APEC'));
    expect(retained.find((message) => message.gmailMessageId === APEC_INNOVA.id)?.platform).toEqual({ id: apec?.id, name: 'APEC' });
    expect(
      retained.find((message) => message.gmailMessageId === MCDONALDS_ACKNOWLEDGEMENT.id)?.platform,
    ).toBeNull();
  });

  it('[ENF-RGP-01] hands over metadata, an excerpt of at most 300 characters and at most 2 000 of the body', async () => {
    await connectMailbox(aliceId);

    const { retained } = await newFetcher().fetchNewMessages(aliceId);

    for (const message of retained) {
      expect([...message.snippet].length).toBeLessThanOrEqual(300);
      // BES-30: read for the classification only, never stored (gmail-sync.test.ts).
      expect([...message.text].length).toBeLessThanOrEqual(2000);
    }
    expect(retained.find((message) => message.gmailMessageId === LONG_NEWSLETTER.id)?.snippet).toHaveLength(
      300,
    );
    expect(Object.keys(retained[0] ?? {}).sort()).toEqual(
      [
        'direction',
        'fromAddress',
        'gmailMessageId',
        'gmailThreadId',
        'platform',
        'receivedAt',
        'sender',
        'snippet',
        'subject',
        'text',
      ].sort(),
    );
  });

  it('[Q-09] gives the initial keywords at the first synchronisation, then keeps the user’s own list', async () => {
    await connectMailbox(aliceId);
    const keywordsOf = async () =>
      (
        await database.db
          .select({ keyword: prefilterKeywords.keyword })
          .from(prefilterKeywords)
          .where(eq(prefilterKeywords.userId, aliceId))
      ).map((row) => row.keyword);

    await newFetcher().fetchNewMessages(aliceId);
    expect((await keywordsOf()).sort()).toEqual([...DEFAULT_JOB_KEYWORDS].sort());

    await database.db.delete(prefilterKeywords).where(eq(prefilterKeywords.userId, aliceId));
    await database.db.insert(prefilterKeywords).values({ userId: aliceId, keyword: 'relevé' });
    await database.db.delete(processedMessages).where(eq(processedMessages.userId, aliceId));
    const { retained } = await newFetcher().fetchNewMessages(aliceId);

    expect(await keywordsOf()).toEqual(['relevé']);
    expect(retained.map((message) => message.gmailMessageId)).toEqual([BANK_STATEMENT.id, APEC_INNOVA.id]);
  });
});

describe('MessageFetcher — incremental synchronisation', () => {
  it('[EF-GML-06] never reads again a message already processed', async () => {
    await connectMailbox(aliceId);
    await readBack(aliceId, 120);
    await newFetcher().fetchNewMessages(aliceId);
    const rowsAfterFirst = await processedRows(aliceId);
    gmail.readIds.length = 0;

    const second = await newFetcher().fetchNewMessages(aliceId);

    expect(gmail.readIds).not.toContain(BANK_STATEMENT.id);
    expect(second.readCount).toBe(MAILBOX.length - 1);
    expect(await processedRows(aliceId)).toEqual(rowsAfterFirst);
  });

  it('[EF-GML-06] reads from one hour before the last synchronisation', async () => {
    await connectMailbox(aliceId);
    const lastSyncAt = new Date('2026-09-21T18:00:00.000Z');
    await database.db.update(gmailAccounts).set({ lastSyncAt }).where(eq(gmailAccounts.userId, aliceId));

    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(lastSearchSince()).toEqual(new Date(lastSyncAt.getTime() - SYNC_OVERLAP_MS));
    expect(result.readCount).toBe(0);
  });

  it('[ENF-FIA-03] resumes an interrupted synchronisation at the next pass, without any duplicate', async () => {
    await connectMailbox(aliceId);
    await readBack(aliceId, 120);
    gmail.breakMessage(APEC_INNOVA.id ?? '');

    await expect(newFetcher().fetchNewMessages(aliceId)).rejects.toThrow('Backend Error');
    gmail.restore();
    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(result.readCount).toBe(MAILBOX.length);
    expect(result.retained.map((message) => message.gmailMessageId)).toContain(APEC_INNOVA.id);
    expect(await processedRows(aliceId)).toEqual([{ id: BANK_STATEMENT.id, outcome: 'prefiltered' }]);
  });

  it('[EF-GML-06] skips a message deleted between the listing and the reading', async () => {
    gmail = createFakeGmail([BANK_STATEMENT], { listedButDeleted: ['18f0ffffffffffff'] });
    await connectMailbox(aliceId);

    const result = await newFetcher().fetchNewMessages(aliceId);

    expect(result.readCount).toBe(1);
    expect(await processedRows(aliceId)).toEqual([{ id: BANK_STATEMENT.id, outcome: 'prefiltered' }]);
  });

  it('[EF-AUT-06] keeps the processed messages of each user apart', async () => {
    await registerUser(context.app, 'bob@example.com');
    const bobId = await userIdOf('bob@example.com');
    await connectMailbox(aliceId);
    await connectMailbox(bobId);
    await readBack(aliceId, 120);
    await readBack(bobId, 120);
    const fetcher = newFetcher();

    await fetcher.fetchNewMessages(aliceId);
    const forBob = await fetcher.fetchNewMessages(bobId);

    expect(forBob.readCount).toBe(MAILBOX.length);
    const bobRows = await database.db
      .select({ id: processedMessages.gmailMessageId })
      .from(processedMessages)
      .where(
        and(
          eq(processedMessages.userId, bobId),
          eq(processedMessages.gmailMessageId, BANK_STATEMENT.id ?? ''),
        ),
      );
    expect(bobRows).toHaveLength(1);
  });
});
