import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as repository from '../../src/modules/emails/repository.js';
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

describe('reading the acknowledgements again on the load of ENF-PERF-01', () => {
  it('[ENF-PERF-04] [EF-GML-20] lists the acknowledgements of a candidate without reading every message', async () => {
    const queries = await capture(pool, (db) => repository.listReceivedEmails(db, userId, 'acknowledged'));

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });

  it('[ENF-PERF-04] [RG-20] lists the messages still without a contact address without reading every message', async () => {
    const queries = await capture(pool, (db) => repository.listEmailsWithoutContact(db, userId));

    expect(queries.length).toBeGreaterThan(0);
    expect(await largeTablesScanned(pool, queries)).toEqual([]);
  });
});
