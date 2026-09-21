import { createApp } from './app.js';
import { type Config, loadConfig } from './config/env.js';
import { createLogger } from './lib/logger.js';

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;

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
const server = createApp({ config, logger }).listen(config.port, config.host, () => {
  logger.info('api listening', { host: config.host, port: config.port });
});

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(EXIT_SUCCESS));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', { error: reason });
  process.exit(EXIT_FAILURE);
});
