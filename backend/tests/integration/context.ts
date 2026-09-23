import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { createJobQueue, type JobQueue } from '../../src/jobs/queue.js';
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
import { createAuthService } from '../../src/modules/auth/service.js';
import { createGmailConnectionService } from '../../src/modules/emails/connection.js';
import { createMessageFetcher } from '../../src/modules/emails/fetcher.js';
import type { GoogleOAuth } from '../../src/modules/emails/googleOAuth.js';
import type { OpenMailbox } from '../../src/modules/emails/mailbox.js';
import { createOAuthStateStore } from '../../src/modules/emails/oauthState.js';
import { createGmailModules } from '../../src/modules/emails/routes.js';
import { createGmailSync, type GmailSync } from '../../src/modules/emails/sync.js';
import { createSettingsModule } from '../../src/modules/settings/routes.js';
import { createStatsModule } from '../../src/modules/stats/routes.js';
import { createStatsService } from '../../src/modules/stats/service.js';
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
  return { listMessageIds: refuse, getMessage: refuse, listLabels: refuse, createLabel: refuse, modifyThread: refuse };
};

/** AI that must never be reached: tests needing a classification pass their own scripted provider. */
const unreachableAi: Partial<Record<ProviderName, LlmProvider>> = {
  gemini: {
    name: 'gemini',
    model: 'unreachable',
    complete: () => Promise.reject(new Error('No AI provider must be called in this test')),
  },
};

/** Doubles of the external services; every one is unreachable unless a test gives its own. */
export interface ExternalServices {
  google?: GoogleOAuth;
  openMailbox?: OpenMailbox;
  aiProviders?: Partial<Record<ProviderName, LlmProvider>>;
}

/** Real application on the local test database, with an injectable clock and fake external services. */
export const createTestContext = (
  database: DatabaseHandle,
  {
    google = unreachableGoogle,
    openMailbox = unreachableMailbox,
    aiProviders = unreachableAi,
  }: ExternalServices = {},
): TestContext => {
  const clock = createTestClock(new Date('2026-09-22T08:00:00.000Z'));
  const logger = createLogger({ write: () => undefined });
  const encryptionKey = randomBytes(32);
  const authService = createAuthService({
    db: database.db,
    clock: clock.now,
    passwordParams: TEST_PASSWORD_PARAMS,
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
  const sync = createGmailSync({
    db: database.db,
    fetcher: createMessageFetcher({ db: database.db, openMailbox, encryptionKey, clock: clock.now }),
    router: createLlmRouter({ providers: aiProviders, journal: createLlmJournal(database.db), logger }),
    queue,
    clock: clock.now,
    logger,
  });
  const app = createApp({
    config: { frontendOrigin: FRONTEND_ORIGIN },
    logger,
    authenticate: (token) => authService.authenticate(token),
    modules: [
      ...createAuthModules({ service: authService, isCookieSecure: true }),
      createApplicationsModule(createApplicationsService({ db: database.db, clock: clock.now })),
      createStatsModule(createStatsService({ db: database.db, clock: clock.now })),
      ...createGmailModules({ service: gmailService, sync, frontendOrigin: FRONTEND_ORIGIN }),
      createJobsModule(queue),
      createProfileModule(createProfileService({ db: database.db, clock: clock.now })),
      createSettingsModule(describeAssignments(aiProviders)),
    ],
  });
  return { app, database, clock, encryptionKey, gmailSync: sync, queue };
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
