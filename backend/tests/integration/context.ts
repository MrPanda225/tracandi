import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { connectDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { createApplicationsModule } from '../../src/modules/applications/routes.js';
import { createApplicationsService } from '../../src/modules/applications/service.js';
import { createAuthModules } from '../../src/modules/auth/routes.js';
import { createAuthService } from '../../src/modules/auth/service.js';
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
}

/** Real application on the local test database, with an injectable clock. */
export const createTestContext = (database: DatabaseHandle): TestContext => {
  const clock = createTestClock(new Date('2026-09-22T08:00:00.000Z'));
  const logger = createLogger({ write: () => undefined });
  const authService = createAuthService({
    db: database.db,
    clock: clock.now,
    passwordParams: TEST_PASSWORD_PARAMS,
  });
  const app = createApp({
    config: { frontendOrigin: FRONTEND_ORIGIN },
    logger,
    authenticate: (token) => authService.authenticate(token),
    modules: [
      ...createAuthModules({ service: authService, isCookieSecure: true }),
      createApplicationsModule(createApplicationsService({ db: database.db, clock: clock.now })),
      createStatsModule(createStatsService({ db: database.db, clock: clock.now })),
    ],
  });
  return { app, database, clock };
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
