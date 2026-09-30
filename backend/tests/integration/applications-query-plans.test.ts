import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as repository from '../../src/modules/applications/repository.js';
import { ListApplicationsQuerySchema } from '../../src/modules/applications/schemas.js';
import { openTestDatabase, truncateAll } from './context.js';
import { seedLoadDataset } from './load-dataset.js';
import { capture, largeTablesScanned } from './query-plans.js';
import { testDatabaseUrl } from './test-database.js';

const NOW = new Date('2026-09-22T08:00:00.000Z');

const database = openTestDatabase();
const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
let userId: number;

beforeAll(async () => {
  await truncateAll(database);
  userId = await seedLoadDataset(database.db, pool, NOW);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await database.close();
});

const listWith = (query: Record<string, string>) =>
  capture(pool, (db) =>
    repository.listApplications(db, userId, { ...ListApplicationsQuerySchema.parse(query), searchKey: '' }),
  );

// ENF-PERF-01: a page in less than 2 s; the list query takes a small share of it.
const MAX_LIST_MS = 200;

describe('the list of applications on the load of ENF-PERF-01', () => {
  it('[ENF-PERF-04] [EF-CAN-24] lists a period without reading every application', async () => {
    const queries = await listWith({ appliedFrom: '2026-09-01', appliedTo: '2026-09-15' });

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });

  // Every application of the candidate is asked for: not a selective query (ENF-PERF-04), so it is timed instead.
  it.each([
    ['the most recent first (default)', {}],
    ['the oldest first', { sort: 'applied_at', order: 'asc' }],
    ['by last activity', { sort: 'last_activity' }],
    ['by status', { sort: 'status' }],
    ['by company', { sort: 'company', order: 'asc' }],
  ])(`[ENF-PERF-01] [EF-CAN-20] lists 1 000 applications %s in less than ${String(MAX_LIST_MS)} ms`, async (_case, query) => {
    const startedAt = performance.now();
    await listWith(query);

    expect(performance.now() - startedAt).toBeLessThan(MAX_LIST_MS);
  });
});
