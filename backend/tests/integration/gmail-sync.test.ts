import { asc, eq } from 'drizzle-orm';
import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  appSettings,
  applicationStatusHistory,
  applications,
  companies,
  emails,
  gmailAccounts,
  llmCalls,
  platforms,
  processedMessages,
  users,
} from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import { MAX_MESSAGES_PER_PASS } from '../../src/modules/emails/fetcher.js';
import { CLASSIFY_CONCURRENCY } from '../../src/modules/emails/sync.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { deleteGmailAccount, saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import {
  ALTERNANCE_ACKNOWLEDGEMENT,
  APEC_INNOVA,
  BANK_STATEMENT,
  HTML_LATE_REJECTION,
  jobAlerts,
  LHH_STUDIO_ARDENT,
  LONG_NEWSLETTER,
  MAISON_LUMEN_REJECTION,
  MARATHON_REGISTRATION,
  MCDONALDS_ACKNOWLEDGEMENT,
  MCDONALDS_INTERVIEW,
  OLD_SPONTANEOUS_APPLICATION,
  otherMessages,
  POLITE_REJECTION,
  SENT_APPLICATION,
  WORKDAY_LATE_REJECTION,
} from '../fixtures/emails/messages.js';
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
let gmail: FakeGmail;
let ai: ScriptedClassifier;
let alice: string;
let aliceId: number;

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

const connectMailbox = (userId: number) =>
  saveGmailAccount(database.db, {
    userId,
    emailAddress: 'alex.martin@example.com',
    refreshToken: encryptSecret('1//refresh-token', context.encryptionKey),
    connectedAt: SYNC_TIME,
    resetSync: true,
  });

/** A context whose mailbox holds `messages` and whose AI answers the recorded classifications. */
const setUp = async (messages: readonly gmail_v1.Schema$Message[]) => {
  gmail = createFakeGmail(messages);
  ai = createScriptedClassifier('gemini');
  context = createTestContext(database, {
    openMailbox: () => createGmailMailbox(gmail.client),
    aiProviders: { gemini: ai.provider },
  });
  context.clock.set(SYNC_TIME);
  alice = await registerUser(context.app, 'alice@example.com');
  aliceId = await userIdOf('alice@example.com');
  await connectMailbox(aliceId);
};

/** EF-CFG-04: sets N, the period of the first synchronisation, for the scenarios built on older messages. */
const readBack = (days: number) =>
  database.db.update(appSettings).set({ gmailLookbackDays: days }).where(eq(appSettings.userId, aliceId));

const accept = (cookie = alice) =>
  request(context.app).post('/api/gmail/sync').set('Cookie', cookie).set('Content-Type', 'application/json');

/**
 * EF-EXE-01: the pass is queued and the route answers at once. The tests wait for the queue, then read the
 * counters the execution journaled.
 */
const synchronise = async (cookie = alice) => {
  const accepted = await accept(cookie);
  await context.queue.drain();
  const runId = (accepted.body as { runId?: number }).runId;
  const state = runId === undefined ? null : await context.queue.stateOf(aliceId, runId);
  return { accepted, state, counters: state?.counters ?? null, error: state?.error ?? null };
};

const applicationsOf = () =>
  database.db
    .select({
      id: applications.id,
      company: companies.name,
      jobTitle: applications.jobTitle,
      status: applications.status,
      contractType: applications.contractType,
      source: applications.source,
      platform: platforms.name,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
    })
    .from(applications)
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .leftJoin(platforms, eq(platforms.id, applications.platformId))
    .where(eq(companies.userId, aliceId))
    .orderBy(asc(companies.name), asc(applications.jobTitle));

const emailsOf = () =>
  database.db
    .select({
      gmailMessageId: emails.gmailMessageId,
      category: emails.category,
      applicationId: emails.applicationId,
      platform: platforms.name,
      classifiedBy: emails.classifiedBy,
      snippet: emails.snippet,
    })
    .from(emails)
    .leftJoin(platforms, eq(platforms.id, emails.platformId))
    .where(eq(emails.userId, aliceId))
    .orderBy(asc(emails.receivedAt));

const outcomeOf = async (gmailMessageId: string | null | undefined) => {
  const [row] = await database.db
    .select({ outcome: processedMessages.outcome })
    .from(processedMessages)
    .where(eq(processedMessages.gmailMessageId, gmailMessageId ?? ''));
  return row?.outcome ?? null;
};

const lastSyncAt = async () => {
  const [row] = await database.db
    .select({ lastSyncAt: gmailAccounts.lastSyncAt })
    .from(gmailAccounts)
    .where(eq(gmailAccounts.userId, aliceId));
  return row?.lastSyncAt ?? null;
};

const countRows = async () => ({
  processed: (await database.db.select({ id: processedMessages.gmailMessageId }).from(processedMessages))
    .length,
  emails: (await database.db.select({ id: emails.id }).from(emails)).length,
  applications: (await database.db.select({ id: applications.id }).from(applications)).length,
  history: (await database.db.select({ id: applicationStatusHistory.id }).from(applicationStatusHistory))
    .length,
});

beforeEach(async () => {
  await truncateAll(database);
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/gmail/sync — manual synchronisation (EF-GML-04)', () => {
  it('[EF-GML-04] answers the number of messages read, retained and classified', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT, BANK_STATEMENT, MARATHON_REGISTRATION]);

    const response = await synchronise();

    expect(response.accepted.status).toBe(202);
    expect(response.counters).toMatchObject({ messages_read: 4, messages_retained: 3, messages_classified: 3 });
  });

  it('[EF-GML-07] makes no AI call for a bank message', async () => {
    await setUp([BANK_STATEMENT]);

    const response = await synchronise();

    expect(response.counters).toMatchObject({ messages_read: 1, messages_retained: 0, messages_classified: 0 });
    expect(ai.requests).toHaveLength(0);
    expect(await outcomeOf(BANK_STATEMENT.id)).toBe('prefiltered');
  });

  it('[EF-GML-04] closes the execution in failure without a connected mailbox, and refuses without a session', async () => {
    await setUp([]);
    await database.db.delete(gmailAccounts);

    const refused = await synchronise();
    const anonymous = await request(context.app)
      .post('/api/gmail/sync')
      .set('Content-Type', 'application/json');

    // EF-EXE-01: the route accepts, the failure closes the execution with its message.
    expect(refused.accepted.status).toBe(202);
    expect(refused.error).toContain('Aucune boîte Gmail');
    expect(anonymous.status).toBe(401);
  });

  it('[EF-EXE-02] queues a second demand instead of refusing it, and runs it after the first', async () => {
    await setUp([SENT_APPLICATION]);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = gmail.client.list;
    let listings = 0;
    gmail.client.list = async (params) => {
      listings += 1;
      if (listings === 1) await held;
      return list(params);
    };

    const first = await accept();
    const second = await accept();
    release();
    await context.queue.drain();

    expect([first.status, second.status]).toEqual([202, 202]);
    const ids = [first, second].map((answer) => (answer.body as { runId: number }).runId);
    expect(ids[0]).toBeLessThan(ids[1] ?? 0);
    for (const id of ids) expect((await context.queue.stateOf(aliceId, id))?.outcome).toBe('success');
  });

  it('[EF-CFG-01] dates the last synchronisation at its start, shown in the status', async () => {
    await setUp([SENT_APPLICATION]);

    await synchronise();
    const status = await request(context.app).get('/api/gmail/status').set('Cookie', alice);

    expect(await lastSyncAt()).toEqual(SYNC_TIME);
    expect((status.body as { lastSyncAt: string }).lastSyncAt).toBe(SYNC_TIME.toISOString());
  });
});

describe('classification and attachment', () => {
  it('[EF-GML-11] attaches the McDonald’s sending, acknowledgement and interview to one application', async () => {
    await setUp([MCDONALDS_INTERVIEW, MCDONALDS_ACKNOWLEDGEMENT, SENT_APPLICATION]);

    await synchronise();

    const created = await applicationsOf();
    expect(created).toEqual([
      expect.objectContaining({
        company: "McDonald's",
        jobTitle: 'Équipier polyvalent',
        status: 'interview',
        source: 'email',
        appliedAt: new Date('2026-09-01T09:00:00.000Z'),
        lastActivityAt: new Date('2026-09-08T09:30:00.000Z'),
      }),
    ]);
    const attached = await emailsOf();
    expect(attached.map((email) => email.category)).toEqual([
      'sent_application',
      'acknowledged',
      'interview',
    ]);
    expect(new Set(attached.map((email) => email.applicationId))).toEqual(new Set([created[0]?.id]));
    const history = await database.db
      .select({ status: applicationStatusHistory.status, origin: applicationStatusHistory.origin })
      .from(applicationStatusHistory)
      .orderBy(asc(applicationStatusHistory.changedAt));
    expect(history).toEqual([
      { status: 'sent', origin: 'email' },
      { status: 'acknowledged', origin: 'email' },
      { status: 'interview', origin: 'email' },
    ]);
  });

  it('[EF-GML-08] gives every retained message a valid category, recorded with the provider that classified it', async () => {
    await setUp([
      SENT_APPLICATION,
      APEC_INNOVA,
      LHH_STUDIO_ARDENT,
      MAISON_LUMEN_REJECTION,
      ALTERNANCE_ACKNOWLEDGEMENT,
      LONG_NEWSLETTER,
    ]);

    await synchronise();

    const stored = await emailsOf();
    expect(stored.map((email) => email.category)).toEqual([
      'sent_application',
      'acknowledged',
      'job_alert',
      'acknowledged',
      'rejected',
      'acknowledged',
    ]);
    expect(stored.every((email) => email.classifiedBy === 'gemini')).toBe(true);
    const [call] = await database.db
      .select({ task: llmCalls.task, outcome: llmCalls.outcome })
      .from(llmCalls);
    expect(call).toEqual({ task: 'classify_emails', outcome: 'success' });
  });

  it('[EF-GML-09] files a message relayed by APEC under the real employer, Innova Solutions', async () => {
    await setUp([APEC_INNOVA]);

    await synchronise();

    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Innova Solutions', jobTitle: 'Data analyst', platform: 'APEC' }),
    ]);
  });

  it('[EF-GML-10] records LHH as the platform of the message and of the application', async () => {
    await setUp([LHH_STUDIO_ARDENT]);

    await synchronise();

    expect((await emailsOf())[0]?.platform).toBe('LHH');
    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Studio Ardent', platform: 'LHH', contractType: 'cdd' }),
    ]);
  });

  it('[EF-GML-10] records the platform named by the AI when the sender domain is unknown, once', async () => {
    const relayedElsewhere = {
      ...LHH_STUDIO_ARDENT,
      payload: {
        headers: [
          { name: 'From', value: 'LHH Talents <talents@lhh-recrutement.example>' },
          { name: 'Subject', value: 'Votre candidature — Chargé de projet digital' },
        ],
      },
    };
    await setUp([relayedElsewhere]);

    await synchronise();

    expect((await emailsOf())[0]?.platform).toBe('LHH');
    const named = await database.db
      .select({ id: platforms.id })
      .from(platforms)
      .where(eq(platforms.name, 'LHH'));
    expect(named).toHaveLength(1);
  });

  it('[EF-GML-12] creates an application at the status Refusée for a refusal from an unknown company', async () => {
    await setUp([MAISON_LUMEN_REJECTION]);

    await synchronise();

    expect(await applicationsOf()).toEqual([
      expect.objectContaining({
        company: 'Maison Lumen',
        jobTitle: 'UX designer',
        status: 'rejected',
        appliedAt: new Date('2026-09-16T16:20:00.000Z'),
      }),
    ]);
  });

  it('[EF-GML-19] records the contract type mentioned by the message: alternance', async () => {
    await setUp([ALTERNANCE_ACKNOWLEDGEMENT]);

    await synchronise();

    expect(await applicationsOf()).toEqual([
      expect.objectContaining({
        company: 'Atelier Nova',
        jobTitle: 'Data Analyst',
        contractType: 'alternance',
      }),
    ]);
  });

  it('[RG-03] files a message without employer nor platform under « Entreprise inconnue », « Candidature »', async () => {
    await setUp([OLD_SPONTANEOUS_APPLICATION]);
    // This recorded message is older than the 30 days read by default (EF-GML-05).
    await readBack(120);

    await synchronise();

    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Entreprise inconnue', jobTitle: 'Candidature', status: 'sent' }),
    ]);
  });

  it('[RG-17] files a refusal opened by an acknowledgement as a refusal, not as an acknowledgement', async () => {
    await setUp([POLITE_REJECTION]);

    await synchronise();

    // The recorded AI answer for this message is « acknowledged »: the wording of the message decides.
    expect((await emailsOf()).map((email) => email.category)).toEqual(['rejected']);
    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Atelier Nova', jobTitle: 'Data Analyst', status: 'rejected' }),
    ]);
  });

  it('[BES-30] [RG-17] files as refusals the refusals written after Gmail’s excerpt, plain or HTML', async () => {
    await setUp([WORKDAY_LATE_REJECTION, HTML_LATE_REJECTION]);

    await synchronise();

    // The recorded AI answers are « acknowledged »: the start of the body, read in memory, decides.
    expect((await emailsOf()).map((email) => email.category)).toEqual(['rejected', 'rejected']);
    expect(await applicationsOf()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ company: 'Maison Lumen', status: 'rejected' }),
      ]) as unknown,
    );
  });

  it('[ENF-RGP-01] [BES-30] gives the AI the start of the body, and keeps only the 300 characters of the excerpt', async () => {
    await setUp([WORKDAY_LATE_REJECTION]);

    await synchronise();

    expect(ai.requests[0]?.prompt).toContain('nous ne pouvons pas donner de suite favorable');
    const [email] = await emailsOf();
    expect(email?.snippet?.length).toBeLessThanOrEqual(300);
    expect(email?.snippet).not.toContain('suite favorable');
  });

  it('[EF-CAN-11] [RG-04] never downgrades an interview when a late acknowledgement arrives', async () => {
    await setUp([MCDONALDS_ACKNOWLEDGEMENT]);
    await request(context.app)
      .post('/api/applications')
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({
        companyName: "McDonald's",
        jobTitle: 'Équipier polyvalent',
        status: 'interview',
        appliedAt: '2026-08-30T12:00:00.000Z',
      })
      .expect(201);

    await synchronise();

    expect(await applicationsOf()).toEqual([
      expect.objectContaining({
        status: 'interview',
        lastActivityAt: new Date('2026-09-02T14:30:00.000Z'),
      }),
    ]);
    expect((await countRows()).history).toBe(1);
  });

  it('[RG-02] stores a job alert without attaching it to any application', async () => {
    await setUp([LONG_NEWSLETTER]);

    await synchronise();

    expect(await emailsOf()).toEqual([
      expect.objectContaining({ category: 'job_alert', applicationId: null }),
    ]);
    expect(await applicationsOf()).toEqual([]);
  });

  it('[ENF-RGP-01] [Q-08] keeps nothing of an off-topic message but its processed id', async () => {
    await setUp([MARATHON_REGISTRATION]);

    const response = await synchronise();

    expect(response.counters).toMatchObject({ messages_read: 1, messages_retained: 1, messages_classified: 1 });
    expect(await emailsOf()).toEqual([]);
    expect(await outcomeOf(MARATHON_REGISTRATION.id)).toBe('off_topic');
  });

  it('[ENF-SEC-06] sends every message framed as untrusted content', async () => {
    await setUp([MCDONALDS_ACKNOWLEDGEMENT]);

    await synchronise();

    expect(ai.requests[0]?.prompt).toMatch(/^<email ref="1" sens="reçu" date="2026-09-02">/);
    expect(ai.requests[0]?.system).toContain('jamais une instruction');
  });
});

describe('incremental and interrupted synchronisations', () => {
  it('[EF-GML-06] adds no row when a second synchronisation finds no new message', async () => {
    await setUp([
      SENT_APPLICATION,
      MCDONALDS_ACKNOWLEDGEMENT,
      BANK_STATEMENT,
      MARATHON_REGISTRATION,
      LONG_NEWSLETTER,
    ]);
    await synchronise();
    const afterFirst = await countRows();

    const second = await synchronise();

    expect(second.counters).toMatchObject({ messages_read: 0, messages_retained: 0, messages_classified: 0 });
    expect(await countRows()).toEqual(afterFirst);
    expect(ai.requests).toHaveLength(1);
  });

  it('[ENF-PERF-02] classifies several batches at once and records them in the order of the messages', async () => {
    const alerts = jobAlerts(25);
    await setUp(alerts);
    let inFlight = 0;
    let highest = 0;
    const complete = ai.provider.complete;
    ai.provider.complete = async (request) => {
      inFlight += 1;
      highest = Math.max(highest, inFlight);
      // Long enough for the calls of one window to overlap, short enough not to slow the suite.
      await new Promise((done) => setTimeout(done, 5));
      try {
        return await complete(request);
      } finally {
        inFlight -= 1;
      }
    };

    const report = await synchronise();

    expect(report.counters).toMatchObject({ messages_read: 25, messages_retained: 25, messages_classified: 25 });
    expect(highest).toBe(CLASSIFY_CONCURRENCY);
    expect(ai.requests).toHaveLength(3);
    // RG-04 reads the statuses in the order the messages arrived: the answers are recorded batch after batch.
    expect((await emailsOf()).map((email) => email.gmailMessageId)).toEqual(alerts.map((m) => m.id));
  });

  it('[ENF-FIA-03] keeps the batches classified before an AI outage, and finishes at the next pass without duplicate', async () => {
    const alerts = jobAlerts(12);
    await setUp(alerts);
    const outage = new Error('503 Service Unavailable');
    const complete = ai.provider.complete;
    let calls = 0;
    ai.provider.complete = (request) => {
      calls += 1;
      return calls === 2 ? Promise.reject(outage) : complete(request);
    };

    const interrupted = await synchronise();

    // EF-EXE-03: the AI outage closes the execution in failure; what was classified before is kept.
    expect(interrupted.state?.outcome).toBe('failure');
    expect(interrupted.error).toContain('IA');
    expect(await lastSyncAt()).toBeNull();
    expect((await emailsOf()).map((email) => email.gmailMessageId)).toEqual(
      alerts.slice(0, 10).map((m) => m.id),
    );

    const resumed = await synchronise();

    expect(resumed.counters).toMatchObject({ messages_read: 2, messages_retained: 2, messages_classified: 2 });
    expect((await emailsOf()).map((email) => email.gmailMessageId)).toEqual(alerts.map((m) => m.id));
    expect(await lastSyncAt()).toEqual(SYNC_TIME);
  });

  it('[ENF-FIA-03] leaves the messages beyond one pass for the next one, without moving the last synchronisation', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT, ...otherMessages(MAX_MESSAGES_PER_PASS)]);

    const first = await synchronise();

    expect(first.counters).toMatchObject({ messages_read: MAX_MESSAGES_PER_PASS, messages_retained: 0, messages_classified: 0 });
    expect(await lastSyncAt()).toBeNull();
    expect(ai.requests).toHaveLength(0);

    const second = await synchronise();

    expect(second.counters).toMatchObject({ messages_read: 2, messages_retained: 2, messages_classified: 2 });
    expect(await lastSyncAt()).toEqual(SYNC_TIME);
  });

  it('[EF-CFG-01] dates the last pass that ended well, even when it left a backlog behind', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT, ...otherMessages(MAX_MESSAGES_PER_PASS)]);

    const first = await synchronise();

    expect(first.counters).toMatchObject({ messages_pending: 1 });
    const status = await request(context.app).get('/api/gmail/status').set('Cookie', alice);
    // The screen dates the pass; the watermark of EF-GML-06 only moves once nothing is left.
    expect(status.body).toMatchObject({ lastRunAt: SYNC_TIME.toISOString(), lastSyncAt: null });

    const second = await synchronise();

    expect(second.counters).toMatchObject({ messages_read: 2, messages_pending: 0 });
    expect((await request(context.app).get('/api/gmail/status').set('Cookie', alice)).body).toMatchObject({
      lastSyncAt: SYNC_TIME.toISOString(),
    });
  });

  it('[ENF-FIA-03] answers a Gmail quota refusal with an explicit message, not an internal error', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    // Gmail's answer once the attempts of the quota governor are spent.
    gmail.client.get = () =>
      Promise.reject(
        Object.assign(new Error("Quota exceeded for quota metric 'Total Query Cost'"), { status: 429 }),
      );

    const refused = await synchronise();

    expect(refused.state?.outcome).toBe('failure');
    expect(refused.error).toContain('Gmail limite temporairement');
    expect(await lastSyncAt()).toBeNull();
  });

  it('[ENF-FIA-03] leaves a message the AI skipped for the next pass, without moving the last synchronisation', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    ai.forgetRef(2);

    const first = await synchronise();

    expect(first.counters).toMatchObject({ messages_read: 2, messages_retained: 2, messages_classified: 1 });
    expect(await lastSyncAt()).toBeNull();
    expect(await outcomeOf(MCDONALDS_ACKNOWLEDGEMENT.id)).toBeNull();

    ai.forgetRef(undefined);
    const second = await synchronise();

    expect(second.counters).toMatchObject({ messages_read: 1, messages_retained: 1, messages_classified: 1 });
    expect(await applicationsOf()).toEqual([expect.objectContaining({ status: 'acknowledged' })]);
  });

  it('[EF-GML-08] classifies by batches of 10 messages', async () => {
    await setUp(jobAlerts(23));

    const response = await synchronise();

    expect(response.counters).toMatchObject({ messages_read: 23, messages_retained: 23, messages_classified: 23 });
    expect(ai.requests.map((call) => (call.prompt.match(/<email ref=/g) ?? []).length)).toEqual([10, 10, 3]);
  });
});

describe('reading the acknowledgements again (EF-GML-20)', () => {
  /** The message as Tracandi read it before T-307: Gmail's excerpt alone, the body never asked for. */
  const withoutBody = (message: gmail_v1.Schema$Message): gmail_v1.Schema$Message => ({
    ...message,
    payload: { ...message.payload, parts: [] },
  });

  const reclassify = async (cookie = alice) => {
    const accepted = await request(context.app)
      .post('/api/gmail/reclassify')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json');
    await context.queue.drain();
    const runId = (accepted.body as { runId?: number }).runId;
    const state = runId === undefined ? null : await context.queue.stateOf(aliceId, runId);
    return { accepted, state };
  };

  it('[EF-GML-20] [RG-04] refiles as a refusal an acknowledgement whose body refuses, with its application and labels', async () => {
    await setUp([withoutBody(WORKDAY_LATE_REJECTION)]);
    await synchronise();
    expect((await emailsOf()).map((email) => email.category)).toEqual(['acknowledged']);
    const aiCalls = ai.requests.length;
    gmail.update(WORKDAY_LATE_REJECTION);

    const { accepted, state } = await reclassify();

    expect(accepted.status).toBe(202);
    expect(state).toMatchObject({
      job: 'gmail_reclassify',
      outcome: 'success',
      counters: { messages_read: 1, messages_corrected: 1 },
    });
    expect((await emailsOf()).map((email) => email.category)).toEqual(['rejected']);
    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Maison Lumen', status: 'rejected' }),
    ]);
    expect(gmail.labelsOfThread(WORKDAY_LATE_REJECTION.threadId ?? '')).toContain('Statut/Refusée');
    expect(gmail.labelsOfThread(WORKDAY_LATE_REJECTION.threadId ?? '')).not.toContain('Statut/En attente');
    // EF-GML-20: RG-17 decides; no AI is asked again.
    expect(ai.requests).toHaveLength(aiCalls);
  });

  it('[EF-GML-20] leaves alone an acknowledgement that refuses nothing', async () => {
    await setUp([MCDONALDS_ACKNOWLEDGEMENT]);
    await synchronise();

    const { state } = await reclassify();

    expect(state?.counters).toEqual({ messages_read: 1, messages_corrected: 0 });
    expect((await emailsOf()).map((email) => email.category)).toEqual(['acknowledged']);
  });

  it('[EF-GML-20] reads nothing when no acknowledgement is stored', async () => {
    await setUp([MAISON_LUMEN_REJECTION]);
    await synchronise();
    const readsBefore = gmail.readIds.length;

    const { state } = await reclassify();

    expect(state?.counters).toEqual({ messages_read: 0, messages_corrected: 0 });
    expect(gmail.readIds).toHaveLength(readsBefore);
  });

  it('[EF-GML-20] ends in failure, with its reason, when no mailbox is connected', async () => {
    await setUp([]);
    await deleteGmailAccount(database.db, aliceId);

    const { state } = await reclassify();

    expect(state).toMatchObject({
      outcome: 'failure',
      error: expect.stringContaining('Aucune boîte Gmail') as unknown,
    });
  });

  it('[EF-AUT-05] refuses the reading again without a session', async () => {
    await setUp([]);

    const response = await request(context.app)
      .post('/api/gmail/reclassify')
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(401);
  });
});
