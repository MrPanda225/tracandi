import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { emails, processedMessages } from '../../src/db/schema.js';
import { connectDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { createJobQueue, type JobQueue } from '../../src/jobs/queue.js';
import { createPdfOcr, type PdfOcr } from '../../src/modules/cvWorkshop/ocr.js';
import { createPdftotext } from '../../src/modules/cvWorkshop/pdftotext.js';
import { type AnalysisResults, createAnalysisResults } from '../../src/modules/cvWorkshop/results.js';
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
import type { Mailer } from '../../src/modules/auth/resendClient.js';
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
import { createAutomaticWatchModule } from '../../src/modules/autowatch/routes.js';
import { createAutomaticWatchService } from '../../src/modules/autowatch/service.js';
import { createChosenOffersModule } from '../../src/modules/chosenOffers/routes.js';
import { createChosenOffersService } from '../../src/modules/chosenOffers/service.js';
import { createCriteriaModule } from '../../src/modules/criteria/routes.js';
import { createCvTypesModule } from '../../src/modules/cvTypes/routes.js';
import type { ProfileDeduction } from '../../src/modules/cvTypes/deduction.js';
import { createCvTypesService } from '../../src/modules/cvTypes/service.js';
import { createOffersModule } from '../../src/modules/offers/routes.js';
import { createOffersService } from '../../src/modules/offers/service.js';
import { createCriteriaService } from '../../src/modules/criteria/service.js';
import { createSitesModule } from '../../src/modules/sites/routes.js';
import { createWatchService, type WatchService } from '../../src/modules/sites/service.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import type { FranceTravailApi } from '../../src/scraper/official/franceTravail.js';
import type { Place, PlaceFinder } from '../../src/scraper/official/geo.js';
import type { LaBonneAlternanceApi } from '../../src/scraper/official/laBonneAlternance.js';
import type { SirenFinder } from '../../src/scraper/official/companySearch.js';
import { testDatabaseUrl } from './test-database.js';

export const FRONTEND_ORIGIN = 'http://127.0.0.1:5173';
// Low scrypt cost to keep tests fast; production uses OWASP_SCRYPT_PARAMS.
const TEST_PASSWORD_PARAMS = { cost: 2 ** 10, blockSize: 8, parallelization: 1 };

/** Controllable clock for time-based rules (RG-06, EF-AUT-07). */
export interface TestClock {
  now: () => Date;
  set: (instant: Date) => void;
  advanceDays: (days: number) => void;
  /** ENF-PERF-09: a long pass, simulated. */
  advanceMinutes: (minutes: number) => void;
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
    advanceMinutes: (minutes) => {
      current = new Date(current.getTime() + minutes * 60 * 1000);
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
  /** What the application holds in memory for 30 minutes: the results of the CV workshop, the profiles deduced. */
  memory: {
    analyses: AnalysisResults<CvAnalysis>;
    deductions: AnalysisResults<ProfileDeduction>;
  };
  /** EF-AUT-14, ENF-RGP-15: the fake mailer behind this context's activation e-mails, to inspect what was sent. */
  mailer: FakeMailer;
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

/** One e-mail recorded by a fake mailer, for the tests that check what was sent (ENF-RGP-15). */
export interface SentMail {
  to: string;
  subject: string;
  html: string;
}

/** A fake mailer records every e-mail; the real Resend API is never reached in a test (testing.md). */
export interface FakeMailer extends Mailer {
  sentEmails: SentMail[];
}

const ACTIVATION_CODE_PATTERN = /code=([^"&\s]+)/;
// EF-AUT-14, EF-AUT-15: the activation code last "sent" to an address, however many fake mailer instances exist in
// the same test file — `registerUser` only has the Express app, not the service's own mailer, to read it from.
const lastActivationCodes = new Map<string, string>();

const LOGIN_CODE_PATTERN = /<strong>(\d{6})<\/strong>/;
// EF-AUT-16: the login code last "sent" to an address, read back by `logInUser` and the tests of the code step.
const lastLoginCodes = new Map<string, string>();

/** The login code a fake mailer last had "sent" to this address, if any. */
export const lastLoginCodeSentTo = (email: string): string | undefined => lastLoginCodes.get(email);

/** The activation code `registerUser` (or a test) last had "sent" to this address by a fake mailer, if any. */
export const lastActivationCodeSentTo = (email: string): string | undefined => lastActivationCodes.get(email);

/** New fake mailer: real network never reached; every send is recorded and its activation code captured. */
export const createFakeMailer = (): FakeMailer => {
  const sentEmails: SentMail[] = [];
  return {
    sentEmails,
    async send(email) {
      sentEmails.push(email);
      const match = ACTIVATION_CODE_PATTERN.exec(email.html);
      if (match?.[1]) lastActivationCodes.set(email.to, decodeURIComponent(match[1]));
      const loginCode = LOGIN_CODE_PATTERN.exec(email.html);
      if (loginCode?.[1]) lastLoginCodes.set(email.to, loginCode[1]);
    },
  };
};

/** The public service of the communes, simulated: it knows Nanterre and nothing else. */
export const NANTERRE: Place = {
  code: '92050',
  name: 'Nanterre',
  departmentCode: '92',
  latitude: 48.8924,
  longitude: 2.2071,
};
const knownPlaces: PlaceFinder = (query) =>
  Promise.resolve(query.trim().toLowerCase().startsWith('nant') ? [NANTERRE] : []);

/** The official APIs a test may simulate (EF-VEI-32, EF-VEI-34, EF-VEI-36). */
interface OfficialDoubles {
  franceTravail: FranceTravailApi | null;
  laBonneAlternance: LaBonneAlternanceApi | null;
  findSiren: SirenFinder | null;
}

const NO_OFFICIAL_API: OfficialDoubles = { franceTravail: null, laBonneAlternance: null, findSiren: null };

/** Doubles of the external services; every one is unreachable unless a test gives its own. */
export interface ExternalServices {
  google?: GoogleOAuth;
  openMailbox?: OpenMailbox;
  aiProviders?: Partial<Record<ProviderName, LlmProvider>>;
  /** The responsible collector of the watch (T-401), simulated: no request ever leaves a test. */
  collect?: AdapterDeps['fetch'];
  /** EF-VEI-30: the public service of the communes, simulated. */
  places?: PlaceFinder;
  /**
   * EF-VEI-32, EF-VEI-34, EF-VEI-36: the official APIs, simulated. One left out is « not configured » (EF-VEI-37);
   * without SIREN search, the watch does without it.
   */
  official?: Partial<OfficialDoubles>;
  /** ENF-RGP-12: where the lines of the log go, to check what a pass writes in it; nowhere by default. */
  logWrite?: (line: string) => void;
  /** EF-CVX-22: the OCR of the scanned pages of an imported CV; the real one (tesseract on this machine) by default. */
  ocr?: PdfOcr;
  /** ENF-MAI-07: the optional features of this deployment; every one by default. */
  features?: EnabledFeatures;
  /** BES-39: proxies in front of the API (Vercel, Northflank); none by default. */
  trustProxyHops?: number;
  /** EF-EXE-07, ENF-PERF-09: ceilings of a pass of the watch; those of the server by default. */
  watchLimits?: { maxScoredOffersPerPass?: number; maxPassMinutes?: number };
  /** EF-AUT-14, ENF-RGP-15: the mailer behind the activation e-mails, simulated; a fresh fake per context by default. */
  mailer?: FakeMailer;
}

/** Where a test sends the log: its own sink, or nowhere. */
const writerOf = (write: ((line: string) => void) | undefined): ((line: string) => void) =>
  write ?? (() => undefined);

/** The OCR a test passes, or the real one (tesseract on this machine). */
const ocrOf = (ocr: PdfOcr | undefined): PdfOcr => ocr ?? createPdfOcr();

/** Real application on the local test database, with an injectable clock and fake external services. */
export const createTestContext = (
  database: DatabaseHandle,
  {
    google = unreachableGoogle,
    openMailbox = unreachableMailbox,
    aiProviders = unreachableAi,
    collect = unreachableCollector,
    places = knownPlaces,
    official = {},
    ocr,
    logWrite,
    features = new Set(OPTIONAL_FEATURES),
    trustProxyHops = 0,
    watchLimits,
    mailer = createFakeMailer(),
  }: ExternalServices = {},
): TestContext => {
  const clock = createTestClock(new Date('2026-09-22T08:00:00.000Z'));
  const logger = createLogger({ write: writerOf(logWrite) });
  const encryptionKey = randomBytes(32);
  const memory = {
    analyses: createAnalysisResults<CvAnalysis>(),
    deductions: createAnalysisResults<ProfileDeduction>(),
  };
  const authService = createAuthService({
    db: database.db,
    clock: clock.now,
    passwordParams: TEST_PASSWORD_PARAMS,
    mailer,
    frontendOrigin: FRONTEND_ORIGIN,
    logger,
    revokeExternalAccess: (userId) => gmailService.disconnect(userId),
    // ENF-RGP-02: what is held in memory for a candidate goes with their account.
    eraseMemoryOf: (userId) => {
      memory.analyses.eraseAll(userId);
      memory.deductions.eraseAll(userId);
    },
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
  const llmRouter = createLlmRouter({
    providers: aiProviders,
    journal: createLlmJournal(database.db),
    logger,
  });
  const fetcher = createMessageFetcher({ db: database.db, openMailbox, encryptionKey, clock: clock.now });
  const sync = createGmailSync({
    db: database.db,
    fetcher,
    router: createLlmRouter({ providers: aiProviders, journal: createLlmJournal(database.db), logger }),
    queue,
    clock: clock.now,
    logger,
  });
  const officialDoubles = { ...NO_OFFICIAL_API, ...official };
  const criteria = createCriteriaService({ db: database.db, clock: clock.now, places, logger });
  const watch = createWatchService({
    db: database.db,
    clock: clock.now,
    criteria,
    profiles: createProfileService({ db: database.db, clock: clock.now }),
    router: llmRouter,
    queue,
    collect,
    officialApis: {
      franceTravail: officialDoubles.franceTravail,
      laBonneAlternance: officialDoubles.laBonneAlternance,
    },
    findSiren: officialDoubles.findSiren,
    logger,
    limits: watchLimits,
    timezone: 'Europe/Paris',
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
        followUps: createFollowUpDrafts({
          db: database.db,
          fetcher,
          router: llmRouter,
          clock: clock.now,
          logger,
        }),
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
            ocr: ocrOf(ocr),
            textLayer: createPdftotext(),
            router: llmRouter,
            results: memory.analyses,
            clock: clock.now,
            analysesPerDay: 5,
          }),
        ),
      ),
      createSettingsModule({ aiAssignments: describeAssignments(aiProviders), features }),
      ...onlyIf(
        features,
        'watch',
        createSitesModule(watch),
        createOffersModule(createOffersService({ db: database.db, clock: clock.now })),
        createCriteriaModule(criteria),
        createCvTypesModule(
          createCvTypesService({
            db: database.db,
            clock: clock.now,
            queue,
            ocr: ocrOf(ocr),
            textLayer: createPdftotext(),
            router: llmRouter,
            deductions: memory.deductions,
            deductionsPerDay: 5,
          }),
        ),
        createChosenOffersModule(
          createChosenOffersService({
            db: database.db,
            clock: clock.now,
            queue,
            router: llmRouter,
            extractionsPerDay: 20,
          }),
        ),
        createAutomaticWatchModule(createAutomaticWatchService({ db: database.db, clock: clock.now })),
      ),
    ],
  });
  return { app, database, clock, encryptionKey, gmailSync: sync, queue, watch, memory, mailer };
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

/** Password `registerUser` creates every account with (also `PASSWORD` in auth.test.ts). */
export const TEST_USER_PASSWORD = 'une phrase de passe longue';

/**
 * Creates an account, activates it with the code the fake mailer "sent" (EF-AUT-14), logs in (both steps, EF-AUT-16) and returns the
 * session cookie — register alone no longer opens one (v1.36).
 */
export const registerUser = async (app: Express, email: string): Promise<string> => {
  const register = await request(app)
    .post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send({ email, password: TEST_USER_PASSWORD });
  if (register.status !== 201) throw new Error(`register failed with ${register.status}`);
  const code = lastActivationCodeSentTo(email);
  if (!code) throw new Error(`no activation code captured for ${email}`);
  const activate = await request(app)
    .post('/api/auth/activate')
    .set('Content-Type', 'application/json')
    .send({ code });
  if (activate.status !== 204) throw new Error(`activate failed with ${activate.status}`);
  return logInUser(app, email);
};

/**
 * Logs an activated account in through both steps (EF-AUT-16): password, then the code the fake mailer "sent".
 * Returns the session cookie.
 */
export const logInUser = async (
  app: Express,
  email: string,
  password = TEST_USER_PASSWORD,
): Promise<string> => {
  const login = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send({ email, password });
  if (login.status !== 200) throw new Error(`login failed with ${login.status}`);
  const code = lastLoginCodeSentTo(email);
  if (!code) throw new Error(`no login code captured for ${email}`);
  const verify = await request(app)
    .post('/api/auth/login/verify')
    .set('Content-Type', 'application/json')
    .send({ challenge: (login.body as { challenge: string }).challenge, code });
  if (verify.status !== 200) throw new Error(`login verification failed with ${verify.status}`);
  return sessionCookieOf(verify);
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

/**
 * ENF-RGP-14: the tables of the database that hold this text somewhere in a row, whatever the column. Every table of
 * the application is read as text, so that a column added later is covered without anyone remembering it.
 */
export const tablesHolding = async (
  database: DatabaseHandle,
  needle: string,
  only?: readonly string[],
): Promise<string[]> => {
  const tables = await database.db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const holding: string[] = [];
  for (const { table_name: name } of tables.rows.filter((row) => !only || only.includes(row.table_name))) {
    const hit = await database.db.execute(
      sql`SELECT 1 FROM ${sql.identifier(name)} AS t WHERE position(${needle} in t::text) > 0 LIMIT 1`,
    );
    if (hit.rows.length > 0) holding.push(name);
  }
  return holding;
};
