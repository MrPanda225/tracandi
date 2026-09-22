import { createApp } from './app.js';
import { type Config, loadConfig } from './config/env.js';
import { connectDatabase } from './db/client.js';
import { systemClock } from './lib/clock.js';
import { createLogger } from './lib/logger.js';
import { createApplicationsModule } from './modules/applications/routes.js';
import { createApplicationsService } from './modules/applications/service.js';
import { OWASP_SCRYPT_PARAMS } from './modules/auth/password.js';
import { createAuthModules } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { createGmailConnectionService } from './modules/emails/connection.js';
import { connectGoogleOAuth } from './modules/emails/googleOAuth.js';
import { createOAuthStateStore } from './modules/emails/oauthState.js';
import { createGmailModules } from './modules/emails/routes.js';
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
});

const gmailService = createGmailConnectionService({
  db: database.db,
  google: connectGoogleOAuth(config.gmail),
  states: createOAuthStateStore({ clock: systemClock }),
  encryptionKey: config.gmail.tokenEncryptionKey,
  clock: systemClock,
  logger,
});

const app = createApp({
  config,
  logger,
  authenticate: (token) => authService.authenticate(token),
  modules: [
    ...createAuthModules({ service: authService, isCookieSecure: config.isCookieSecure }),
    createApplicationsModule(createApplicationsService({ db: database.db, clock: systemClock })),
    createStatsModule(createStatsService({ db: database.db, clock: systemClock })),
    ...createGmailModules({ service: gmailService, frontendOrigin: config.frontendOrigin }),
  ],
});

const server = app.listen(config.port, config.host, () => {
  logger.info('api listening', { host: config.host, port: config.port, docs: '/api/docs' });
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('shutting down', { signal });
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
