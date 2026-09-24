import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/db/schema.js';
import { createStatsService } from '../../src/modules/stats/service.js';
import { openTestDatabase, truncateAll } from './context.js';
import { seedLoadDataset } from './load-dataset.js';
import { testDatabaseUrl } from './test-database.js';

// ENF-PERF-05: bound of each dashboard query, measured on the local test database.
const MAX_EXECUTION_MS = 50;
const NOW = new Date('2026-09-22T08:00:00.000Z');

interface CapturedQuery {
  text: string;
  params: unknown[];
}

interface AnalyzedPlan {
  'Execution Time': number;
}

const database = openTestDatabase();
const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
let userId: number;

/** Runs the dashboard once and returns every SQL statement it sent, with its parameters. */
const captureDashboardQueries = async (): Promise<CapturedQuery[]> => {
  const captured: CapturedQuery[] = [];
  const db = drizzle(pool, {
    schema,
    casing: 'snake_case',
    logger: { logQuery: (text, params) => captured.push({ text, params }) },
  });
  await createStatsService({ db, clock: () => NOW, countsOffers: true }).dashboard(userId);
  return captured;
};

const executionTimeOf = async (query: CapturedQuery): Promise<number> => {
  const result = await pool.query<{ 'QUERY PLAN': AnalyzedPlan[] }>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${query.text}`,
    query.params,
  );
  const plan = result.rows[0]?.['QUERY PLAN'][0];
  if (!plan) throw new Error('EXPLAIN returned no plan');
  return plan['Execution Time'];
};

beforeAll(async () => {
  await truncateAll(database);
  userId = await seedLoadDataset(database.db, pool, NOW);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await database.close();
});

describe('dashboard queries on the load of ENF-PERF-01', () => {
  it(`[ENF-PERF-05] runs each dashboard query in less than ${MAX_EXECUTION_MS} ms`, async () => {
    const queries = await captureDashboardQueries();
    expect(queries.length).toBeGreaterThan(0);

    const slow: { query: string; ms: number }[] = [];
    for (const query of queries) {
      const ms = await executionTimeOf(query);
      if (ms >= MAX_EXECUTION_MS) slow.push({ query: query.text, ms });
    }

    expect(slow).toEqual([]);
  });
});
