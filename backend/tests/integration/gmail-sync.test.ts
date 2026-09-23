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
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import {
  ALTERNANCE_ACKNOWLEDGEMENT,
  APEC_INNOVA,
  BANK_STATEMENT,
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

const synchronise = (cookie = alice) =>
  request(context.app).post('/api/gmail/sync').set('Cookie', cookie).set('Content-Type', 'application/json');

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

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ read: 4, retained: 3, classified: 3 });
  });

  it('[EF-GML-07] makes no AI call for a bank message', async () => {
    await setUp([BANK_STATEMENT]);

    const response = await synchronise();

    expect(response.body).toEqual({ read: 1, retained: 0, classified: 0 });
    expect(ai.requests).toHaveLength(0);
    expect(await outcomeOf(BANK_STATEMENT.id)).toBe('prefiltered');
  });

  it('[EF-GML-04] refuses without a connected mailbox, and without a session', async () => {
    await setUp([]);
    await database.db.delete(gmailAccounts);

    const refused = await synchronise();
    const anonymous = await request(context.app)
      .post('/api/gmail/sync')
      .set('Content-Type', 'application/json');

    expect(refused.status).toBe(409);
    expect((refused.body as { error: string }).error).toContain('Aucune boîte Gmail');
    expect(anonymous.status).toBe(401);
  });

  it('[EF-GML-04] refuses a second synchronisation while one is running', async () => {
    await setUp([SENT_APPLICATION]);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = gmail.client.list;
    gmail.client.list = async (params) => {
      await held;
      return list(params);
    };

    const first = synchronise().then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await synchronise();
    release();

    expect(second.status).toBe(409);
    expect((second.body as { error: string }).error).toBe('Une synchronisation Gmail est déjà en cours.');
    expect((await first).status).toBe(200);
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

    await synchronise().expect(200);

    // The recorded AI answer for this message is « acknowledged »: the wording of the message decides.
    expect((await emailsOf()).map((email) => email.category)).toEqual(['rejected']);
    expect(await applicationsOf()).toEqual([
      expect.objectContaining({ company: 'Atelier Nova', jobTitle: 'Data Analyst', status: 'rejected' }),
    ]);
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

    expect(response.body).toEqual({ read: 1, retained: 1, classified: 1 });
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

    expect(second.body).toEqual({ read: 0, retained: 0, classified: 0 });
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

    const report = await synchronise().expect(200);

    expect(report.body).toEqual({ read: 25, retained: 25, classified: 25 });
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

    expect(interrupted.status).toBe(502);
    expect(await lastSyncAt()).toBeNull();
    expect((await emailsOf()).map((email) => email.gmailMessageId)).toEqual(
      alerts.slice(0, 10).map((m) => m.id),
    );

    const resumed = await synchronise();

    expect(resumed.body).toEqual({ read: 2, retained: 2, classified: 2 });
    expect((await emailsOf()).map((email) => email.gmailMessageId)).toEqual(alerts.map((m) => m.id));
    expect(await lastSyncAt()).toEqual(SYNC_TIME);
  });

  it('[ENF-FIA-03] leaves the messages beyond one pass for the next one, without moving the last synchronisation', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT, ...otherMessages(MAX_MESSAGES_PER_PASS)]);

    const first = await synchronise();

    expect(first.body).toEqual({ read: MAX_MESSAGES_PER_PASS, retained: 0, classified: 0 });
    expect(await lastSyncAt()).toBeNull();
    expect(ai.requests).toHaveLength(0);

    const second = await synchronise();

    expect(second.body).toEqual({ read: 2, retained: 2, classified: 2 });
    expect(await lastSyncAt()).toEqual(SYNC_TIME);
  });

  it('[ENF-FIA-03] answers a Gmail quota refusal with an explicit message, not an internal error', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    // Gmail's answer once the attempts of the quota governor are spent.
    gmail.client.get = () =>
      Promise.reject(
        Object.assign(new Error("Quota exceeded for quota metric 'Total Query Cost'"), { status: 429 }),
      );

    const refused = await synchronise();

    expect(refused.status).toBe(503);
    expect((refused.body as { error: string }).error).toContain('Gmail limite temporairement');
    expect(await lastSyncAt()).toBeNull();
  });

  it('[ENF-FIA-03] leaves a message the AI skipped for the next pass, without moving the last synchronisation', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    ai.forgetRef(2);

    const first = await synchronise();

    expect(first.body).toEqual({ read: 2, retained: 2, classified: 1 });
    expect(await lastSyncAt()).toBeNull();
    expect(await outcomeOf(MCDONALDS_ACKNOWLEDGEMENT.id)).toBeNull();

    ai.forgetRef(undefined);
    const second = await synchronise();

    expect(second.body).toEqual({ read: 1, retained: 1, classified: 1 });
    expect(await applicationsOf()).toEqual([expect.objectContaining({ status: 'acknowledged' })]);
  });

  it('[EF-GML-08] classifies by batches of 10 messages', async () => {
    await setUp(jobAlerts(23));

    const response = await synchronise();

    expect(response.body).toEqual({ read: 23, retained: 23, classified: 23 });
    expect(ai.requests.map((call) => (call.prompt.match(/<email ref=/g) ?? []).length)).toEqual([10, 10, 3]);
  });
});
