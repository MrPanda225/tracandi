import { count, eq, like } from 'drizzle-orm';
import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { companyNameOf, JOB_TITLES, MAIN_USER_LOAD, seedLoadDataset } from '../../src/db/loadDataset.js';
import { applications, emails, users } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import type { LlmProvider } from '../../src/llm/types.js';
import * as applicationsRepository from '../../src/modules/applications/repository.js';
import { ListApplicationsQuerySchema } from '../../src/modules/applications/schemas.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail } from '../fixtures/emails/fakeGmail.js';
import { metadata } from '../fixtures/emails/messages.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';
import { capture, largeTablesScanned } from './query-plans.js';
import { testDatabaseUrl } from './test-database.js';

/**
 * T-703: the thresholds of ENF-PERF-01, 02 and 06 measured through the API on the full ENF-PERF-01 volume (no reduced
 * volume: the dataset loads in about 2 s). The method and the figures are in docs/PERFORMANCE.md.
 */
const database = openTestDatabase();
const NOW = new Date('2026-09-22T08:00:00.000Z');
const TESTER = 'testeuse@example.test';

// ENF-PERF-01: a page in less than 2 s. The API gets half of it, the other half going to the network and the display.
const SCREEN_API_BUDGET_MS = 1_000;
// ENF-PERF-06: no route of the API beyond 2 s.
const ROUTE_BUDGET_MS = 2_000;
// ENF-PERF-02: 100 new messages synchronised in less than 3 minutes.
const SYNC_BUDGET_MS = 3 * 60_000;
const NEW_MESSAGES = 100;
const RUNS = 3;

let context: TestContext;
let cookie: string;
let applicationId: number;
let companyId: number;
let testerId: number;

/** The calls each screen of the interface sends when it opens (frontend/src/api), in parallel like the browser. */
const SCREENS: Record<string, () => string[]> = {
  'Tableau de bord': () => ['/api/auth/session', '/api/settings/features', '/api/stats/dashboard'],
  Candidatures: () => ['/api/applications?sort=applied_at&order=desc&limit=100&offset=0'],
  'Candidatures, recherche « data »': () => [
    '/api/applications?q=data&sort=applied_at&order=desc&limit=100&offset=0',
  ],
  'Candidatures du 1er au 15 septembre': () => [
    '/api/applications?appliedFrom=2026-09-01&appliedTo=2026-09-15&sort=applied_at&order=desc&limit=100&offset=0',
  ],
  'Candidatures par entreprise': () => ['/api/applications?sort=company&order=asc&limit=100&offset=0'],
  'Détail d’une candidature': () => [
    `/api/applications/${String(applicationId)}`,
    `/api/applications/${String(applicationId)}/emails`,
  ],
  Offres: () => ['/api/offers?view=active&limit=50'],
  Sources: () => ['/api/sites', '/api/sites/suggestions', '/api/sites/types'],
  Réglages: () => ['/api/gmail/status', '/api/watch/criteria', '/api/watch/automatic', '/api/cv-types'],
};

const timed = async (path: string): Promise<{ status: number; ms: number }> => {
  const startedAt = performance.now();
  const response = await request(context.app).get(path).set('Cookie', cookie);
  return { status: response.status, ms: performance.now() - startedAt };
};

/** The slowest of several openings of a screen, after a first one that warms the caches like a real session. */
const openScreen = async (
  paths: readonly string[],
): Promise<{ screenMs: number; routeMs: number; statuses: number[] }> => {
  await Promise.all(paths.map(timed));
  let screenMs = 0;
  let routeMs = 0;
  let statuses: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const startedAt = performance.now();
    const results = await Promise.all(paths.map(timed));
    screenMs = Math.max(screenMs, performance.now() - startedAt);
    routeMs = Math.max(routeMs, ...results.map((result) => result.ms));
    statuses = results.map((result) => result.status);
  }
  return { screenMs, routeMs, statuses };
};

/**
 * `NEW_MESSAGES` messages of a mailbox: three answers in five about applications of the dataset (an existing
 * company and job title, RG-03), the others job alerts — the received minute by minute before the synchronisation.
 */
const newMessages = (): gmail_v1.Schema$Message[] =>
  Array.from({ length: NEW_MESSAGES }, (_, index) => {
    const isAnswer = index % 5 < 3;
    const id = `18f0d0000000${String(index).padStart(4, '0')}`;
    return metadata({
      id,
      threadId: id,
      receivedAt: new Date(NOW.getTime() - (NEW_MESSAGES - index) * 60_000).toISOString(),
      from: isAnswer
        ? `Recrutement <rh@entreprise-${String(index)}.example>`
        : 'Alertes <alertes@emplois.example>',
      subject: isAnswer
        ? `Votre candidature n° ${String(index)}`
        : `Alerte emploi n° ${String(index)} : 5 offres`,
      snippet: isAnswer
        ? 'Nous avons bien reçu votre candidature et revenons vers vous.'
        : 'Cinq nouvelles offres de data analyst correspondent à votre recherche.',
    });
  });

const FRAMED_MESSAGE = /<email ref="(\d+)"[^>]*>\n[^\n]*\nObjet : ([^\n]*)\n/gu;
const ANSWER_SUBJECT = /^Votre candidature n° (\d+)$/u;

/** A provider answering at once: an answer names a company and a job title of the dataset, an alert is an alert. */
const instantClassifier: LlmProvider = {
  name: 'gemini',
  model: 'gemini-test',
  complete: (llmRequest) => {
    const messages = [...llmRequest.prompt.matchAll(FRAMED_MESSAGE)].map(([, ref, subject = '']) => {
      const answer = ANSWER_SUBJECT.exec(subject);
      const index = Number(answer?.[1] ?? 0);
      return answer
        ? {
            ref: Number(ref),
            category: index % 2 === 0 ? 'acknowledged' : 'rejected',
            employer: companyNameOf(index % MAIN_USER_LOAD.companies),
            platform: null,
            jobTitle: JOB_TITLES[index % 5] ?? null,
            contractType: null,
          }
        : {
            ref: Number(ref),
            category: 'job_alert',
            employer: null,
            platform: null,
            jobTitle: null,
            contractType: null,
          };
    });
    return Promise.resolve({ text: JSON.stringify({ messages }), inputTokens: 1200, outputTokens: 300 });
  },
};

beforeAll(async () => {
  await truncateAll(database);
  const gmail = createFakeGmail(newMessages());
  context = createTestContext(database, {
    openMailbox: () => createGmailMailbox(gmail.client),
    aiProviders: { gemini: instantClassifier },
  });
  context.clock.set(NOW);
  cookie = await registerUser(context.app, TESTER);
  const [tester] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, TESTER));
  if (!tester) throw new Error('tester not registered');
  await seedLoadDataset(database.db, { now: NOW, mainUserId: tester.id, passwordHash: 'not-a-real-hash' });
  await saveGmailAccount(database.db, {
    userId: tester.id,
    emailAddress: TESTER,
    refreshToken: encryptSecret('1//refresh-token', context.encryptionKey),
    connectedAt: NOW,
    resetSync: true,
  });
  testerId = tester.id;
  const [application] = await database.db
    .select({ id: applications.id, companyId: applications.companyId })
    .from(applications)
    .limit(1);
  applicationId = application?.id ?? 0;
  companyId = application?.companyId ?? 0;
}, 120_000);

afterAll(async () => {
  await database.close();
});

describe('the screens of the application on the load of ENF-PERF-01', () => {
  it.each(Object.entries(SCREENS))(
    `[ENF-PERF-01] [ENF-PERF-06] « %s » gets its data in less than ${String(SCREEN_API_BUDGET_MS)} ms`,
    async (_screen, paths) => {
      const { screenMs, routeMs, statuses } = await openScreen(paths());

      expect(statuses.every((status) => status === 200)).toBe(true);
      expect(routeMs).toBeLessThan(ROUTE_BUDGET_MS);
      expect(screenMs).toBeLessThan(SCREEN_API_BUDGET_MS);
    },
  );
});

describe('an incremental synchronisation on the load of ENF-PERF-01', () => {
  it(
    `[ENF-PERF-02] stores ${String(NEW_MESSAGES)} new messages in less than 3 minutes`,
    async () => {
      const startedAt = performance.now();
      const accepted = await request(context.app)
        .post('/api/gmail/sync')
        .set('Cookie', cookie)
        .set('Content-Type', 'application/json');
      await context.queue.drain();
      const elapsedMs = performance.now() - startedAt;

      expect(accepted.status).toBe(202);
      const [synchronised] = await database.db
        .select({ total: count() })
        .from(emails)
        .where(like(emails.gmailThreadId, '18f0d%'));
      expect(synchronised?.total).toBe(NEW_MESSAGES);
      const stored = await database.db
        .select({ id: emails.id, applicationId: emails.applicationId })
        .from(emails)
        .where(eq(emails.gmailThreadId, '18f0d00000000000'));
      expect(stored).toHaveLength(1);
      // RG-03: the answer joined the application of the dataset instead of creating one.
      expect(stored[0]?.applicationId).not.toBeNull();
      expect(elapsedMs).toBeLessThan(SYNC_BUDGET_MS);
    },
    SYNC_BUDGET_MS + 30_000,
  );
});

describe('the selective queries on the load of ENF-PERF-01', () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });

  afterAll(async () => {
    await pool.end();
  });

  it.each([
    [
      'the detail of an application',
      (db: never) => applicationsRepository.findApplicationDetail(db, testerId, applicationId),
    ],
    [
      'the messages of an application',
      (db: never) => applicationsRepository.listEmailsOfApplication(db, applicationId),
    ],
    // RG-03: the applications of the company a message names, to attach it.
    [
      'the applications of a company',
      (db: never) => applicationsRepository.listCompanyApplications(db, companyId),
    ],
    [
      'the applications of a period',
      (db: never) =>
        applicationsRepository.listApplications(db, testerId, {
          ...ListApplicationsQuerySchema.parse({ appliedFrom: '2026-09-01', appliedTo: '2026-09-15' }),
          searchKey: '',
        }),
    ],
  ])('[ENF-PERF-04] reads %s without a full scan of a large table', async (_case, work) => {
    const queries = await capture(pool, work);

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });
});
