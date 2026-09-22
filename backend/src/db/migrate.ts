import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createLogger, type Logger } from '../lib/logger.js';
import { connectDatabase } from './client.js';
import { describeDatabaseUrlProblem } from './url.js';

// Same relative location from src/db (tsx) and dist/db (built image).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Applies the pending migrations of `backend/drizzle/` in order, each in its own transaction; already applied ones
 * are skipped (journal table `drizzle.__drizzle_migrations`), so a second run has no effect.
 * Must be called with the owner role, never with the application role (ENF-SEC-09).
 * @throws Error when the URL is invalid or insecure, or when a migration fails (nothing of that migration is kept).
 * @req ENF-MAI-05, ENF-SEC-09, ENF-SEC-15
 */
export const runMigrations = async (connectionString: string, logger: Logger): Promise<void> => {
  const problem = describeDatabaseUrlProblem(connectionString);
  if (problem) throw new Error(`DATABASE_URL_MIGRATOR ${problem}`);
  const handle = connectDatabase(connectionString, logger);
  try {
    await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await handle.close();
  }
};

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const logger = createLogger();
  runMigrations(process.env['DATABASE_URL_MIGRATOR'] ?? '', logger)
    .then(() => {
      logger.info('migrations applied');
    })
    .catch((error: unknown) => {
      logger.error('migration failed', { error });
      process.exitCode = 1;
    });
}
