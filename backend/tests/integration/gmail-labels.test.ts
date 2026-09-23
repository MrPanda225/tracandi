import { eq } from 'drizzle-orm';
import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { emails, gmailLabels, users } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import {
  LONG_NEWSLETTER,
  MAISON_LUMEN_REJECTION,
  MCDONALDS_ACKNOWLEDGEMENT,
  MCDONALDS_INTERVIEW,
  SENT_APPLICATION,
} from '../fixtures/emails/messages.js';
import { createScriptedClassifier } from '../fixtures/llm/classifications.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
const SYNC_TIME = new Date('2026-09-22T10:00:00.000Z');
const MCDONALDS_THREAD = SENT_APPLICATION.threadId ?? '';
const INTERVIEW_THREAD = MCDONALDS_INTERVIEW.threadId ?? '';
const ALERT_THREAD = LONG_NEWSLETTER.threadId ?? '';

let context: TestContext;
let gmail: FakeGmail;
let alice: string;
let aliceId: number;

const setUp = async (messages: readonly gmail_v1.Schema$Message[]) => {
  gmail = createFakeGmail(messages);
  context = createTestContext(database, {
    openMailbox: () => createGmailMailbox(gmail.client),
    aiProviders: { gemini: createScriptedClassifier('gemini').provider },
  });
  context.clock.set(SYNC_TIME);
  alice = await registerUser(context.app, 'alice@example.com');
  const [user] = await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'alice@example.com'));
  aliceId = user?.id ?? 0;
  await saveGmailAccount(database.db, {
    userId: aliceId,
    emailAddress: 'alex.martin@example.com',
    refreshToken: encryptSecret('1//refresh-token', context.encryptionKey),
    connectedAt: SYNC_TIME,
    resetSync: true,
  });
};

/** EF-EXE-01: the pass is queued; the tests wait for the queue before looking at Gmail. */
const synchronise = async () => {
  const accepted = await request(context.app)
    .post('/api/gmail/sync')
    .set('Cookie', alice)
    .set('Content-Type', 'application/json');
  await context.queue.drain();
  const runId = (accepted.body as { runId?: number }).runId;
  return runId === undefined ? null : await context.queue.stateOf(aliceId, runId);
};

const setApplyLabels = (body: unknown, cookie = alice) =>
  request(context.app)
    .patch('/api/gmail/settings')
    .set('Cookie', cookie)
    .set('Content-Type', 'application/json')
    .send(body as object);

beforeEach(async () => {
  await truncateAll(database);
});

afterAll(async () => {
  await database.close();
});

describe('Gmail labels written by the synchronisation', () => {
  it('[EF-GML-13] labels the thread of an attached message « Candidatures/‹Entreprise› » and its RG-05 status', async () => {
    await setUp([MAISON_LUMEN_REJECTION]);

    await synchronise();

    expect(gmail.labelsOfThread(MAISON_LUMEN_REJECTION.threadId ?? '')).toEqual([
      'Candidatures/Maison Lumen',
      'INBOX',
      'Statut/Refusée',
      'UNREAD',
    ]);
  });

  it('[EF-GML-14] moves every thread of an application from « En attente » to « Entretien »', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    await synchronise();
    expect(gmail.labelsOfThread(MCDONALDS_THREAD)).toContain('Statut/En attente');

    gmail.deliver({ ...MCDONALDS_INTERVIEW, internalDate: String(Date.parse('2026-09-22T12:00:00.000Z')) });
    context.clock.set(new Date('2026-09-22T14:00:00.000Z'));
    await synchronise();

    for (const thread of [MCDONALDS_THREAD, INTERVIEW_THREAD]) {
      expect(gmail.labelsOfThread(thread)).toContain('Statut/Entretien');
      expect(gmail.labelsOfThread(thread)).toContain("Candidatures/McDonald's");
      expect(gmail.labelsOfThread(thread)).not.toContain('Statut/En attente');
    }
  });

  it('[EF-GML-15] [EF-GML-16] labels a job alert « Alertes emploi » and takes it out of the inbox', async () => {
    await setUp([LONG_NEWSLETTER]);

    await synchronise();

    expect(gmail.labelsOfThread(ALERT_THREAD)).toEqual(['Alertes emploi', 'UNREAD']);
  });

  it('[EF-GML-13] remembers the label ids, so that the next synchronisation does not list the labels again', async () => {
    await setUp([MAISON_LUMEN_REJECTION]);
    await synchronise();
    const remembered = await database.db
      .select({ name: gmailLabels.name })
      .from(gmailLabels)
      .where(eq(gmailLabels.userId, aliceId));

    // Another refusal of the same company: the same two labels, already remembered.
    gmail.deliver({
      ...MAISON_LUMEN_REJECTION,
      id: '18f0c00000000001',
      threadId: '18f0c00000000001',
      internalDate: String(Date.parse('2026-09-22T12:00:00.000Z')),
    });
    context.clock.set(new Date('2026-09-22T14:00:00.000Z'));
    await synchronise();

    expect(remembered.map((label) => label.name).sort()).toEqual([
      'Candidatures/Maison Lumen',
      'Statut/Refusée',
    ]);
    expect(gmail.labelListings()).toBe(1);
  });

  it('[EF-GML-13] keeps a synchronisation whose labels Gmail refuses', async () => {
    await setUp([MAISON_LUMEN_REJECTION]);
    gmail.client.modifyThread = () =>
      Promise.reject(Object.assign(new Error('Backend Error'), { status: 503 }));

    const response = await synchronise();

    // EF-GML-13: a refusal of Gmail on the labels never fails the pass already recorded.
    expect(response?.outcome).toBe('success');
    expect(response?.counters).toMatchObject({
      messages_read: 1,
      messages_retained: 1,
      messages_classified: 1,
    });
    expect(await database.db.select({ id: emails.id }).from(emails)).toHaveLength(1);
  });
});

describe('PATCH /api/gmail/settings — read-only mode (EF-GML-17)', () => {
  it('[EF-GML-17] writes no label at all once the writing of labels is off', async () => {
    await setUp([MAISON_LUMEN_REJECTION, LONG_NEWSLETTER]);

    await setApplyLabels({ applyLabels: false }).expect(204);
    await synchronise();

    expect(gmail.modifyCalls).toEqual([]);
    expect(gmail.createdLabels).toEqual([]);
    expect(gmail.labelListings()).toBe(0);
  });

  it('[EF-GML-17] shows the setting in the status, on by default', async () => {
    await setUp([]);
    const status = () => request(context.app).get('/api/gmail/status').set('Cookie', alice);

    expect((await status()).body).toMatchObject({ connected: true, applyLabels: true });
    await setApplyLabels({ applyLabels: false }).expect(204);
    expect((await status()).body).toMatchObject({ applyLabels: false });
    await setApplyLabels({ applyLabels: true }).expect(204);
    expect((await status()).body).toMatchObject({ applyLabels: true });
  });

  it('[EF-CFG-04] shows the period of the first synchronisation and records a new one', async () => {
    await setUp([]);
    const status = () => request(context.app).get('/api/gmail/status').set('Cookie', alice);

    // Cahier v1.5: 30 days by default.
    expect((await status()).body).toMatchObject({ connected: true, lookbackDays: 30 });
    await setApplyLabels({ lookbackDays: 7 }).expect(204);

    expect((await status()).body).toMatchObject({ lookbackDays: 7, applyLabels: true });
  });

  it.each([
    ['a period below the minimum', { lookbackDays: 0 }],
    ['a period above a year', { lookbackDays: 366 }],
    ['a period that is not a whole number', { lookbackDays: 30.5 }],
  ])('[ENF-SEC-04] [EF-CFG-04] refuses %s', async (_case, body) => {
    await setUp([]);

    expect((await setApplyLabels(body)).status).toBe(400);
    expect((await request(context.app).get('/api/gmail/status').set('Cookie', alice)).body).toMatchObject({
      lookbackDays: 30,
    });
  });

  it.each([
    ['a missing value', {}],
    ['a text instead of a boolean', { applyLabels: 'non' }],
    ['an unknown field', { applyLabels: true, deleteMessages: true }],
  ])('[ENF-SEC-04] refuses %s', async (_case, body) => {
    await setUp([]);

    const response = await setApplyLabels(body);

    expect(response.status).toBe(400);
  });

  it('[EF-AUT-05] refuses the setting without a session', async () => {
    await setUp([]);

    const response = await request(context.app)
      .patch('/api/gmail/settings')
      .set('Content-Type', 'application/json')
      .send({ applyLabels: false });

    expect(response.status).toBe(401);
  });
});
