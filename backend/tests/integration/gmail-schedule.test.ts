import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { emails, gmailAccounts, jobRunCounters, jobRuns, users } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import { BANK_STATEMENT, MAISON_LUMEN_REJECTION, SENT_APPLICATION } from '../fixtures/emails/messages.js';
import { createScriptedClassifier, type ScriptedClassifier } from '../fixtures/llm/classifications.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
const SYNC_TIME = new Date('2026-09-22T10:00:00.000Z');

let context: TestContext;
let ai: ScriptedClassifier;
/** One fake mailbox per refresh token, i.e. per user. */
let mailboxes: Map<string, FakeGmail>;

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

/** Registers a user whose Gmail holds `messages`; returns their id and session cookie. */
const userWithMailbox = async (email: string, gmail: FakeGmail | null) => {
  const cookie = await registerUser(context.app, email);
  const userId = await userIdOf(email);
  if (gmail) {
    const token = `1//refresh-token-${userId}`;
    mailboxes.set(token, gmail);
    await saveGmailAccount(database.db, {
      userId,
      emailAddress: email,
      refreshToken: encryptSecret(token, context.encryptionKey),
      connectedAt: SYNC_TIME,
      resetSync: true,
    });
  }
  return { userId, cookie };
};

const runsOf = (userId: number) =>
  database.db
    .select({
      id: jobRuns.id,
      job: jobRuns.job,
      triggerType: jobRuns.triggerType,
      outcome: jobRuns.outcome,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      error: jobRuns.error,
    })
    .from(jobRuns)
    .where(eq(jobRuns.userId, userId))
    .orderBy(asc(jobRuns.id));

const countersOf = async (runId: number) =>
  Object.fromEntries(
    (
      await database.db
        .select({ counter: jobRunCounters.counter, value: jobRunCounters.value })
        .from(jobRunCounters)
        .where(eq(jobRunCounters.runId, runId))
    ).map((row) => [row.counter, row.value]),
  );

const invalidGrant = () => Promise.reject(new Error('invalid_grant'));

beforeEach(async () => {
  await truncateAll(database);
  mailboxes = new Map();
  ai = createScriptedClassifier('gemini');
  context = createTestContext(database, {
    openMailbox: (token) => {
      const gmail = mailboxes.get(token);
      if (!gmail) throw new Error('unknown mailbox');
      return createGmailMailbox(gmail.client);
    },
    aiProviders: { gemini: ai.provider },
  });
  context.clock.set(SYNC_TIME);
});

afterAll(async () => {
  await database.close();
});

describe('journal of the synchronisations (EF-GML-18)', () => {
  it('[EF-GML-18] journals a manual synchronisation: start, end, outcome and counters', async () => {
    const alice = await userWithMailbox(
      'alice@example.com',
      createFakeGmail([SENT_APPLICATION, BANK_STATEMENT]),
    );

    await request(context.app)
      .post('/api/gmail/sync')
      .set('Cookie', alice.cookie)
      .set('Content-Type', 'application/json')
      .expect(200);

    const [run, ...others] = await runsOf(alice.userId);
    expect(others).toEqual([]);
    expect(run).toMatchObject({
      job: 'gmail_sync',
      triggerType: 'manual',
      outcome: 'success',
      startedAt: SYNC_TIME,
      finishedAt: SYNC_TIME,
      error: null,
    });
    expect(await countersOf(run?.id ?? 0)).toEqual({
      messages_read: 2,
      messages_retained: 1,
      messages_classified: 1,
    });
  });

  it('[EF-GML-18] journals a failed synchronisation with its error', async () => {
    const alice = await userWithMailbox('alice@example.com', createFakeGmail([SENT_APPLICATION]));
    ai.setFailure(new Error('503 Service Unavailable'));

    await request(context.app)
      .post('/api/gmail/sync')
      .set('Cookie', alice.cookie)
      .set('Content-Type', 'application/json')
      .expect(502);

    const [run] = await runsOf(alice.userId);
    expect(run).toMatchObject({
      outcome: 'failure',
      error: 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
      finishedAt: SYNC_TIME,
    });
    expect(await countersOf(run?.id ?? 0)).toEqual({});
  });

  it('[EF-GML-18] journals as skipped a synchronisation asked while another one runs', async () => {
    const gmail = createFakeGmail([SENT_APPLICATION]);
    const alice = await userWithMailbox('alice@example.com', gmail);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = gmail.client.list;
    gmail.client.list = async (params) => {
      await held;
      return list(params);
    };

    const first = context.gmailSync.synchronise(alice.userId, 'schedule');
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(context.gmailSync.synchronise(alice.userId, 'manual')).rejects.toThrow('déjà en cours');
    release();
    await first;

    expect((await runsOf(alice.userId)).map((run) => [run.triggerType, run.outcome])).toEqual([
      ['schedule', 'success'],
      ['manual', 'skipped'],
    ]);
  });
});

describe('scheduled synchronisation (EF-GML-03)', () => {
  it('[EF-GML-03] synchronises every connected mailbox, and only those', async () => {
    const alice = await userWithMailbox('alice@example.com', createFakeGmail([SENT_APPLICATION]));
    const bob = await userWithMailbox('bob@example.com', createFakeGmail([MAISON_LUMEN_REJECTION]));
    const carol = await userWithMailbox('carol@example.com', null);

    await context.gmailSync.synchroniseEveryMailbox();

    for (const userId of [alice.userId, bob.userId]) {
      expect((await runsOf(userId)).map((run) => [run.triggerType, run.outcome])).toEqual([
        ['schedule', 'success'],
      ]);
    }
    expect(await runsOf(carol.userId)).toEqual([]);
    expect(await database.db.select({ id: emails.id }).from(emails)).toHaveLength(2);
  });

  it('[ENF-FIA-01] goes on with the other mailboxes when one synchronisation fails, and never throws', async () => {
    const failing = createFakeGmail([SENT_APPLICATION]);
    failing.client.list = () => Promise.reject(Object.assign(new Error('Backend Error'), { status: 503 }));
    const alice = await userWithMailbox('alice@example.com', failing);
    const bob = await userWithMailbox('bob@example.com', createFakeGmail([MAISON_LUMEN_REJECTION]));

    await expect(context.gmailSync.synchroniseEveryMailbox()).resolves.toBeUndefined();

    expect((await runsOf(alice.userId)).map((run) => run.outcome)).toEqual(['failure']);
    expect((await runsOf(bob.userId)).map((run) => run.outcome)).toEqual(['success']);
  });
});

describe('expired authorisation (Q-11)', () => {
  it('[Q-11] marks the connection expired when Google refuses the refresh token, and tells the user', async () => {
    const gmail = createFakeGmail([SENT_APPLICATION]);
    gmail.client.list = invalidGrant;
    const alice = await userWithMailbox('alice@example.com', gmail);

    const response = await request(context.app)
      .post('/api/gmail/sync')
      .set('Cookie', alice.cookie)
      .set('Content-Type', 'application/json');
    const status = await request(context.app).get('/api/gmail/status').set('Cookie', alice.cookie);

    expect(response.status).toBe(409);
    expect((response.body as { error: string }).error).toBe(
      'L’autorisation Gmail a expiré : reconnectez Gmail depuis les Réglages.',
    );
    expect(status.body).toMatchObject({ connected: true, authorizationExpired: true });
  });

  it('[Q-11] leaves an expired mailbox to the user until a new connection', async () => {
    const gmail = createFakeGmail([SENT_APPLICATION]);
    gmail.client.list = invalidGrant;
    const alice = await userWithMailbox('alice@example.com', gmail);
    await context.gmailSync.synchroniseEveryMailbox();

    await context.gmailSync.synchroniseEveryMailbox();
    expect(await runsOf(alice.userId)).toHaveLength(1);

    await saveGmailAccount(database.db, {
      userId: alice.userId,
      emailAddress: 'alice@example.com',
      refreshToken: encryptSecret(`1//refresh-token-${alice.userId}`, context.encryptionKey),
      connectedAt: SYNC_TIME,
      resetSync: false,
    });
    const [account] = await database.db
      .select({ expiredAt: gmailAccounts.authorizationExpiredAt })
      .from(gmailAccounts)
      .where(eq(gmailAccounts.userId, alice.userId));
    expect(account?.expiredAt).toBeNull();
    gmail.client.list = createFakeGmail([SENT_APPLICATION]).client.list;
    await context.gmailSync.synchroniseEveryMailbox();
    expect((await runsOf(alice.userId)).map((run) => run.outcome)).toEqual(['failure', 'success']);
  });
});
