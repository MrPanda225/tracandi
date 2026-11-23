import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as repository from '../../src/modules/emails/repository.js';
import { openTestDatabase, truncateAll } from './context.js';
import { seedLoadDataset } from './load-dataset.js';
import { type CapturedQuery, capture, largeTablesScanned } from './query-plans.js';
import { testDatabaseUrl } from './test-database.js';

const NOW = new Date('2026-09-22T08:00:00.000Z');
// ENF-PERF-05: bound of a query that reads all of a candidate's rows, measured on the local test database.
const MAX_EXECUTION_MS = 50;

const database = openTestDatabase();
const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
let userId: number;

const executionTimeOf = async (query: CapturedQuery): Promise<number> => {
  const result = await pool.query<{ 'QUERY PLAN': { 'Execution Time': number }[] }>(
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

describe('reading the acknowledgements again on the load of ENF-PERF-01', () => {
  it('[ENF-PERF-04] [EF-GML-20] lists the acknowledgements of a candidate without reading every message', async () => {
    const queries = await capture(pool, (db) => repository.listReceivedEmails(db, userId, 'acknowledged'));

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });

  // Read by nature over every message of the candidate that carries a contact (most of them): a full scan is the
  // right plan, held like the dashboard aggregates to ENF-PERF-05.
  it(`[ENF-PERF-05] [RG-20] lists the contact addresses of a candidate in less than ${MAX_EXECUTION_MS} ms`, async () => {
    const queries = await capture(pool, (db) => repository.listEmailContacts(db, userId));

    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(await executionTimeOf(query)).toBeLessThan(MAX_EXECUTION_MS);
  });

  it('[ENF-PERF-04] [RG-20] lists the messages still without a contact address without reading every message', async () => {
    const queries = await capture(pool, (db) => repository.listEmailsWithoutContact(db, userId));

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });
});
