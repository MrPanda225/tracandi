import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { emails, processedMessages } from '../../src/db/schema.js';
import { connectDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { createJobQueue, type JobQueue } from '../../src/jobs/queue.js';
import { createPdfOcr } from '../../src/modules/cvWorkshop/ocr.js';
import { createAnalysisResults } from '../../src/modules/cvWorkshop/results.js';
import { createCvWorkshopModule } from '../../src/modules/cvWorkshop/routes.js';
import { type CvAnalysis, createCvWorkshopService } from '../../src/modules/cvWorkshop/service.js';
import { type EnabledFeatures, OPTIONAL_FEATURES, onlyIf } from '../../src/lib/features.js';
import { createLogger } from '../../src/lib/logger.js';
import { describeAssignments } from '../../src/llm/assignments.js';
import { createLlmJournal } from '../../src/llm/repository.js';
import { createLlmRouter } from '../../src/llm/router.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import { createApplicationsModule } from '../../src/modules/applications/routes.js';
import { createJobsModule } from '../../src/modules/jobs/routes.js';
import { createProfileModule } from '../../src/modules/cv/routes.js';
import { createProfileService } from '../../src/modules/cv/service.js';
import { createApplicationsService } from '../../src/modules/applications/service.js';
import { createAuthModules } from '../../src/modules/auth/routes.js';
import { createAccountModule } from '../../src/modules/account/routes.js';
import { createAccountService } from '../../src/modules/account/service.js';
import { createAuthService } from '../../src/modules/auth/service.js';
import { createGmailConnectionService } from '../../src/modules/emails/connection.js';
import { createMessageFetcher } from '../../src/modules/emails/fetcher.js';
import type { GoogleOAuth } from '../../src/modules/emails/googleOAuth.js';
import type { OpenMailbox } from '../../src/modules/emails/mailbox.js';
import { createOAuthStateStore } from '../../src/modules/emails/oauthState.js';
import { createFollowUpDrafts } from '../../src/modules/emails/followUp.js';
import { createGmailModules } from '../../src/modules/emails/routes.js';
import { createGmailSync, type GmailSync } from '../../src/modules/emails/sync.js';
import { createSettingsModule } from '../../src/modules/settings/routes.js';
import { createStatsModule } from '../../src/modules/stats/routes.js';
import { createStatsService } from '../../src/modules/stats/service.js';
import { createSitesModule } from '../../src/modules/sites/routes.js';
import { createWatchService, type WatchService } from '../../src/modules/sites/service.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import { testDatabaseUrl } from './test-database.js';

export const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
// Low scrypt cost to keep tests fast; production uses OWASP_SCRYPT_PARAMS.
const TEST_PASSWORD_PARAMS = { cost: 2 ** 10, blockSize: 8, parallelization: 1 };

/** Controllable clock for time-based rules (RG-06, EF-AUT-07). */
export interface TestClock {
  now: () => Date;
  set: (instant: Date) => void;
  advanceDays: (days: number) => void;
}

const createTestClock = (start: Date): TestClock => {
  let current = start;
  return {
    now: () => current,
    set: (instant) => {
      current = instant;
    },
    advanceDays: (days) => {
      current = new Date(current.getTime() + days * 24 * 60 * 60 * 1000);
    },
  };
};

export interface TestContext {
  app: Express;
  database: DatabaseHandle;
  clock: TestClock;
  /** Key of the Gmail tokens at rest in this context (ENF-SEC-02). */
  encryptionKey: Buffer;
  /** The Gmail synchronisation behind the routes, for the scheduled runs (EF-GML-03). */
  gmailSync: GmailSync;
  /** EF-EXE-01 : file d'attente des traitements longs, pour attendre leur fin dans un test. */
  queue: JobQueue;
  /** The watch behind the routes, for the scheduled pass (EF-VEI-06). */
  watch: WatchService;
}

/** Google that must never be reached: tests needing Google pass their own fake. */
const unreachableGoogle: GoogleOAuth = {
  authorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  exchangeCode: () => Promise.reject(new Error('Google must not be called in this test')),
  revoke: () => Promise.reject(new Error('Google must not be called in this test')),
};

/** Gmail that must never be reached: tests reading a mailbox pass their own fake. */
const unreachableMailbox: OpenMailbox = () => {
  const refuse = () => Promise.reject(new Error('Gmail must not be called in this test'));
  return {
    listMessageIds: refuse,
    getMessage: refuse,
    listLabels: refuse,
    createLabel: refuse,
    modifyThread: refuse,
    threadMessages: refuse,
    createDraft: refuse,
  };
};

/** AI that must never be reached: tests needing a classification pass their own scripted provider. */
const unreachableAi: Partial<Record<ProviderName, LlmProvider>> = {
  gemini: {
    name: 'gemini',
    model: 'unreachable',
    complete: () => Promise.reject(new Error('No AI provider must be called in this test')),
  },
};

/** Career sites that must never be reached: tests reading one pass their own collector. */
const unreachableCollector: AdapterDeps['fetch'] = () =>
  Promise.reject(new Error('No career site must be reached in this test'));

/** Doubles of the external services; every one is unreachable unless a test gives its own. */
export interface ExternalServices {
  google?: GoogleOAuth;
  openMailbox?: OpenMailbox;
  aiProviders?: Partial<Record<ProviderName, LlmProvider>>;
  /** The responsible collector of the watch (T-401), simulated: no request ever leaves a test. */
  collect?: AdapterDeps['fetch'];
  /** ENF-MAI-07: the optional features of this deployment; every one by default. */
  features?: EnabledFeatures;
  /** BES-39: proxies in front of the API (Vercel, Northflank); none by default. */
  trustProxyHops?: number;
}

/** Real application on the local test database, with an injectable clock and fake external services. */
export const createTestContext = (
  database: DatabaseHandle,
  {
    google = unreachableGoogle,
    openMailbox = unreachableMailbox,
    aiProviders = unreachableAi,
    collect = unreachableCollector,
    features = new Set(OPTIONAL_FEATURES),
    trustProxyHops = 0,
  }: ExternalServices = {},
): TestContext => {
  const clock = createTestClock(new Date('2026-09-22T08:00:00.000Z'));
  const logger = createLogger({ write: () => undefined });
  const encryptionKey = randomBytes(32);
  const authService = createAuthService({
    db: database.db,
    clock: clock.now,
    passwordParams: TEST_PASSWORD_PARAMS,
    revokeExternalAccess: (userId) => gmailService.disconnect(userId),
  });
  const queue = createJobQueue({ db: database.db, clock: clock.now, logger });
  const gmailService = createGmailConnectionService({
    db: database.db,
    google,
    states: createOAuthStateStore({ clock: clock.now }),
    encryptionKey,
    clock: clock.now,
    logger,
  });
  const llmRouter = createLlmRouter({ providers: aiProviders, journal: createLlmJournal(database.db), logger });
  const fetcher = createMessageFetcher({ db: database.db, openMailbox, encryptionKey, clock: clock.now });
  const sync = createGmailSync({
    db: database.db,
    fetcher,
    router: createLlmRouter({ providers: aiProviders, journal: createLlmJournal(database.db), logger }),
    queue,
    clock: clock.now,
    logger,
  });
  const watch = createWatchService({
    db: database.db,
    clock: clock.now,
    profiles: createProfileService({ db: database.db, clock: clock.now }),
    router: llmRouter,
    queue,
    collect,
    logger,
  });
  const app = createApp({
    config: { frontendOrigin: FRONTEND_ORIGIN, trustProxyHops },
    logger,
    authenticate: (token) => authService.authenticate(token),
    modules: [
      ...createAuthModules({ service: authService, isCookieSecure: true }),
      createApplicationsModule(createApplicationsService({ db: database.db, clock: clock.now })),
      createAccountModule(createAccountService({ db: database.db, clock: clock.now })),
      createStatsModule(
        createStatsService({ db: database.db, clock: clock.now, countsOffers: features.has('watch') }),
      ),
      ...createGmailModules({
        service: gmailService,
        sync,
        followUps: createFollowUpDrafts({ db: database.db, fetcher, router: llmRouter, clock: clock.now, logger }),
        frontendOrigin: FRONTEND_ORIGIN,
      }),
      createJobsModule(queue),
      ...onlyIf(
        features,
        'cv',
        createProfileModule(createProfileService({ db: database.db, clock: clock.now })),
        createCvWorkshopModule(
          createCvWorkshopService({
            queue,
            ocr: createPdfOcr(),
            router: llmRouter,
            results: createAnalysisResults<CvAnalysis>(),
            clock: clock.now,
            analysesPerDay: 5,
          }),
        ),
      ),
      createSettingsModule({ aiAssignments: describeAssignments(aiProviders), features }),
      ...onlyIf(features, 'watch', createSitesModule(watch)),
    ],
  });
  return { app, database, clock, encryptionKey, gmailSync: sync, queue, watch };
};

export const openTestDatabase = (): DatabaseHandle =>
  connectDatabase(testDatabaseUrl(), createLogger({ write: () => undefined }));

/** Empties every table between tests (database.md: TRUNCATE ... RESTART IDENTITY CASCADE). */
export const truncateAll = async (database: DatabaseHandle): Promise<void> => {
  await database.db.execute(sql`TRUNCATE users, platforms, llm_model_prices RESTART IDENTITY CASCADE`);
};

/** `name=value` of the session cookie set by a response, to send it back like a browser would. */
export const sessionCookieOf = (response: request.Response): string => {
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? (header as string[]) : [];
  const session = cookies.find((cookie) => cookie.startsWith('tracandi_session='));
  if (!session) throw new Error('no session cookie in response');
  return session.split(';')[0] ?? '';
};

/** Creates an account and returns its session cookie. */
export const registerUser = async (app: Express, email: string): Promise<string> => {
  const response = await request(app)
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email, password: 'une phrase de passe longue' });
  if (response.status !== 201) throw new Error(`register failed with ${response.status}`);
  return sessionCookieOf(response);
};

/**
 * RG-20: attaches to an application a received message carrying a contact address, as a synchronisation would; the
 * application keeps its last activity. Returns the id of the message.
 */
export const giveContact = async (
  database: DatabaseHandle,
  { userId, applicationId, address }: { userId: number; applicationId: number; address: string },
): Promise<number> => {
  const gmailMessageId = `contact-${applicationId}-${address}`;
  await database.db.insert(processedMessages).values({ userId, gmailMessageId, outcome: 'retained' });
  const [row] = await database.db
    .insert(emails)
    .values({
      userId,
      gmailMessageId,
      gmailThreadId: `thread-${gmailMessageId}`,
      applicationId,
      direction: 'inbound',
      fromAddress: address,
      contactAddress: address,
      subject: 'Votre candidature',
      snippet: 'Nous avons bien reçu votre candidature.',
      category: 'acknowledged',
      receivedAt: new Date('2026-01-05T09:00:00.000Z'),
    })
    .returning({ id: emails.id });
  if (!row) throw new Error('contact message not stored');
  return row.id;
};

