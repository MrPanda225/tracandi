import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createLogger, type Logger } from '../lib/logger.js';
import { connectDatabase } from './client.js';
import { describeDatabaseUrlProblem } from './url.js';

// Same relative location from src/db (tsx) and dist/db (built image).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/**
 * Applies the pending migrations of `backend/drizzle/` in order, all of them in one single transaction (drizzle's
 * migrator); already applied ones are skipped (journal table `drizzle.__drizzle_migrations`), so a second run has no
 * effect. Consequence: a value added to an enumeration (`ALTER TYPE … ADD VALUE`) cannot be used by a later migration
 * of the same run — PostgreSQL refuses a new enum value before its transaction commits. No migration may therefore
 * write `technical_test` (0034, T-904) if it can be deployed together with 0034; it goes to a later deployment.
 * Must be called with the owner role, never with the application role (ENF-SEC-09).
 * @param variableName the environment variable the URL comes from, named in the error (never the URL itself).
 * @throws Error when the URL is invalid or insecure, or when a migration fails (nothing of the run is kept).
 * @req ENF-MAI-05, ENF-SEC-09, ENF-SEC-15
 */
export const runMigrations = async (
  connectionString: string,
  logger: Logger,
  variableName = 'DATABASE_URL_MIGRATOR',
): Promise<void> => {
  const problem = describeDatabaseUrlProblem(connectionString);
  if (problem) throw new Error(`${variableName} ${problem}`);
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
