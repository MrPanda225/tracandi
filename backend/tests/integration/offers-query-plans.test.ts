import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as repository from '../../src/modules/offers/repository.js';
import { OfferQuerySchema } from '../../src/modules/offers/schemas.js';
import { openTestDatabase, truncateAll } from './context.js';
import { seedLoadDataset } from './load-dataset.js';
import { capture } from './query-plans.js';
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

// ENF-PERF-01: a page in less than 2 s; the list query takes a small share of it.
const MAX_LIST_MS = 200;

describe('the list of offers on the load of ENF-PERF-01', () => {
  // The offers of a single candidate are all asked for: not a selective query (ENF-PERF-04), so it is timed instead.
  it.each([
    ['to look at (default)', {}],
    ['from a score of 60', { minScore: '60' }],
    ['in CDI', { contractType: 'cdi' }],
    ['kept', { view: 'saved' }],
  ])(
    `[ENF-PERF-01] [EF-VEI-16] lists 5 000 offers %s in less than ${String(MAX_LIST_MS)} ms`,
    async (_case, query) => {
      const startedAt = performance.now();
      const queries = await capture(pool, (db) =>
        repository.listOffers(db, userId, OfferQuerySchema.parse(query)),
      );

      expect(queries.length).toBeGreaterThan(0);
      expect(performance.now() - startedAt).toBeLessThan(MAX_LIST_MS);
    },
  );
});
