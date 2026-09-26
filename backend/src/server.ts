import { createApp } from './app.js';
import { type Config, loadConfig } from './config/env.js';
import { connectDatabase } from './db/client.js';
import { createJobQueue } from './jobs/queue.js';
import { startScheduler } from './jobs/scheduler.js';
import { onlyIf } from './lib/features.js';
import { systemClock } from './lib/clock.js';
import { createLogger } from './lib/logger.js';
import { describeAssignments } from './llm/assignments.js';
import { connectClaude } from './llm/providers/claude.js';
import { connectGemini } from './llm/providers/gemini.js';
import { createOpenAiCompatibleProvider, GROQ_BASE_URL } from './llm/providers/openaiCompatible.js';
import type { ProviderName } from './llm/types.js';
import { createLlmJournal } from './llm/repository.js';
import { createLlmRouter } from './llm/router.js';
import { createApplicationsModule } from './modules/applications/routes.js';
import { createJobsModule } from './modules/jobs/routes.js';
import { createProfileModule } from './modules/cv/routes.js';
import { createProfileService } from './modules/cv/service.js';
import { createApplicationsService } from './modules/applications/service.js';
import { OWASP_SCRYPT_PARAMS } from './modules/auth/password.js';
import { createAuthModules } from './modules/auth/routes.js';
import { createAccountModule } from './modules/account/routes.js';
import { createAccountService } from './modules/account/service.js';
import { createAuthService } from './modules/auth/service.js';
import { createGmailConnectionService } from './modules/emails/connection.js';
import { createMessageFetcher } from './modules/emails/fetcher.js';
import { connectGoogleOAuth } from './modules/emails/googleOAuth.js';
import { connectGmailMailbox } from './modules/emails/mailbox.js';
import { createOAuthStateStore } from './modules/emails/oauthState.js';
import { createFollowUpDrafts } from './modules/emails/followUp.js';
import { createGmailModules } from './modules/emails/routes.js';
import { createGmailSync } from './modules/emails/sync.js';
import { createSettingsModule } from './modules/settings/routes.js';
import { createSitesModule } from './modules/sites/routes.js';
import { createWatchService } from './modules/sites/service.js';
import { createPoliteFetch } from './scraper/http.js';
import { createStatsModule } from './modules/stats/routes.js';
import { createStatsService } from './modules/stats/service.js';

const EXIT_FAILURE = 1;

const logger = createLogger();

const readConfigOrExit = (): Config => {
  try {
    return loadConfig(process.env);
  } catch (error) {
    // Fail fast: never start with an invalid or incomplete configuration.
    logger.error('invalid configuration, server not started', { error });
    process.exit(EXIT_FAILURE);
  }
};

const config = readConfigOrExit();
const database = connectDatabase(config.databaseUrl, logger);
const authService = createAuthService({
  db: database.db,
  clock: systemClock,
  passwordParams: OWASP_SCRYPT_PARAMS,
  // EF-AUT-11: a deleted account leaves no Gmail access behind (revocation at Google, best effort).
  revokeExternalAccess: (userId) => gmailService.disconnect(userId),
});

const gmailService = createGmailConnectionService({
  db: database.db,
  google: connectGoogleOAuth(config.gmail),
  states: createOAuthStateStore({ clock: systemClock }),
  encryptionKey: config.gmail.tokenEncryptionKey,
  clock: systemClock,
  logger,
});

// EF-IA-05: only the providers whose key is configured.
// EF-IA-05: only the providers whose key and model are configured; each Groq model is a route entry of RG-13.
const configuredProviders = Object.fromEntries(
  Object.entries(config.llm).flatMap(([name, provider]) => {
    if (name === 'claude') return [[name, connectClaude(provider)]];
    if (name === 'gemini') return [[name, connectGemini(provider)]];
    return [
      [
        name,
        createOpenAiCompatibleProvider({
          name: name as ProviderName,
          model: provider.model,
          baseUrl: GROQ_BASE_URL,
          apiKey: provider.apiKey,
        }),
      ],
    ];
  }),
);

const llmRouter = createLlmRouter({
  providers: configuredProviders,
  journal: createLlmJournal(database.db),
  logger,
});

const jobQueue = createJobQueue({
  db: database.db,
  clock: systemClock,
  logger,
  maxConcurrentRuns: config.maxConcurrentJobs,
});

const messageFetcher = createMessageFetcher({
  db: database.db,
  openMailbox: connectGmailMailbox(config.gmail, {
    // ENF-FIA-03: a quota refusal or a Gmail outage is attempted again; the journal keeps why the pass was slow.
    onRetry: ({ attempt, delayMs, error }) => logger.warn('gmail call attempted again', { attempt, delayMs, error }),
  }),
  encryptionKey: config.gmail.tokenEncryptionKey,
  clock: systemClock,
});

const gmailSync = createGmailSync({
  db: database.db,
  fetcher: messageFetcher,
  router: llmRouter,
  queue: jobQueue,
  clock: systemClock,
  logger,
});

/**
 * ENF-COL-03: without a contact address, nothing is collected. The watch then answers a readable refusal instead
 * of reading a site anonymously; every other feature keeps working.
 */
const collect = config.scraper.contact
  ? createPoliteFetch({ contact: config.scraper.contact })
  : () =>
      Promise.reject(
        new Error('Renseignez SCRAPER_CONTACT_EMAIL pour que la veille puisse consulter un site.'),
      );

const watchService = createWatchService({
  db: database.db,
  clock: systemClock,
  profiles: createProfileService({ db: database.db, clock: systemClock }),
  router: llmRouter,
  queue: jobQueue,
  collect,
  logger,
});

// EF-EXE-05: an execution the previous run left waiting or running is closed before anything else starts.
await jobQueue.closeInterrupted();

const app = createApp({
  config,
  logger,
  authenticate: (token) => authService.authenticate(token),
  modules: [
    ...createAuthModules({ service: authService, isCookieSecure: config.isCookieSecure }),
    createApplicationsModule(createApplicationsService({ db: database.db, clock: systemClock })),
    // EF-AUT-12
    createAccountModule(createAccountService({ db: database.db, clock: systemClock })),
    createStatsModule(
      createStatsService({ db: database.db, clock: systemClock, countsOffers: config.features.has('watch') }),
    ),
    ...createGmailModules({
      service: gmailService,
      sync: gmailSync,
      // EF-CAN-17
      followUps: createFollowUpDrafts({
        db: database.db,
        fetcher: messageFetcher,
        router: llmRouter,
        clock: systemClock,
        logger,
      }),
      frontendOrigin: config.frontendOrigin,
    }),
    createJobsModule(jobQueue),
    // ENF-MAI-07: an optional feature that is not enabled exposes no route.
    ...onlyIf(
      config.features,
      'cv',
      createProfileModule(createProfileService({ db: database.db, clock: systemClock })),
    ),
    createSettingsModule({ aiAssignments: describeAssignments(config.llm), features: config.features }),
    ...onlyIf(config.features, 'watch', createSitesModule(watchService)),
  ],
});

const server = app.listen(config.port, config.host, () => {
  logger.info('api listening', {
    host: config.host,
    port: config.port,
    docs: '/api/docs',
    features: [...config.features],
  });
});

// EF-GML-03: every connected mailbox, on the configured schedule and time zone.
const scheduler = startScheduler({
  jobs: [
    { name: 'gmail_sync', cron: config.scheduler.gmailCron, run: () => gmailSync.synchroniseEveryMailbox() },
    // EF-VEI-06: every active source of every candidate, at 7, 13 and 19 o'clock Paris time — when the watch runs.
    ...onlyIf(config.features, 'watch', {
      name: 'scraper',
      cron: config.scheduler.watchCron,
      run: () => watchService.checkEverySource(),
    }),
  ],
  timezone: config.scheduler.timezone,
  logger,
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('shutting down', { signal });
  void scheduler.stop();
  server.close(() => {
    database.close().then(
      () => process.exit(),
      (error: unknown) => {
        logger.error('database pool close failed', { error });
        process.exit(EXIT_FAILURE);
      },
    );
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', { error: reason });
  process.exit(EXIT_FAILURE);
});
