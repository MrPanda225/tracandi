import pg from 'pg';
import { runMigrations } from '../../src/db/migrate.js';
import { createLogger } from '../../src/lib/logger.js';
import { testDatabaseUrl } from './test-database.js';

/**
 * Recreates the local test database from scratch, then applies every migration (ENF-MAI-05),
 * so that each integration run starts from the exact schema produced by `backend/drizzle/`.
 */
export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  await runMigrations(url, createLogger({ write: () => undefined }));
}
