import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Logger } from '../lib/logger.js';
import * as schema from './schema.js';

// The dashboard sends 7 queries at once (stats service): a smaller pool queues some of them for one more round trip
// to Neon, which costs far more than the queries themselves (< 1 ms each, ENF-PERF-05).
const POOL_MAX_CONNECTIONS = 10;
// Coming back to a screen within minutes reuses open TLS connections instead of opening new ones to Neon.
const IDLE_TIMEOUT_MS = 5 * 60_000;
// Neon suspends idle computes: the first connection may take several seconds (cold start).
const CONNECTION_TIMEOUT_MS = 15_000;

/** Typed Drizzle database, the only entry point to PostgreSQL for repositories (ADR-02). */
export type Database = NodePgDatabase<typeof schema>;

/** Database with its connection pool, closed on shutdown. */
export interface DatabaseHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Opens a connection pool and returns the Drizzle database (snake_case columns). Connections are opened lazily:
 * an unreachable server is reported by the first query, not here. Errors of idle connections are logged, never fatal.
 * The caller validates the URL beforehand (`describeDatabaseUrlProblem`).
 * @req ENF-SEC-05, ENF-SEC-15, ENF-SEC-16
 */
export const connectDatabase = (connectionString: string, logger: Logger): DatabaseHandle => {
  const pool = new pg.Pool({
    connectionString,
    max: POOL_MAX_CONNECTIONS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });
  pool.on('error', (error) => {
    logger.error('idle database connection error', { error });
  });
  return { db: drizzle(pool, { schema, casing: 'snake_case' }), close: () => pool.end() };
};
