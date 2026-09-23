import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/db/schema.js';
import * as repository from '../../src/modules/sites/repository.js';
import { openTestDatabase, truncateAll } from './context.js';
import { seedLoadDataset } from './load-dataset.js';
import { testDatabaseUrl } from './test-database.js';

const NOW = new Date('2026-09-22T08:00:00.000Z');

interface CapturedQuery {
  text: string;
  params: unknown[];
}

/** ENF-PERF-05 : borne d'une requête qui agrège, faute de pouvoir être sélective. */
const MAX_EXECUTION_MS = 50;

interface AnalyzedPlan {
  'Execution Time': number;
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
}

const database = openTestDatabase();
const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
let userId: number;
let siteId: number;

/** Runs `work` and returns every SQL statement it sent, with its parameters. */
const capture = async (
  work: (db: ReturnType<typeof drizzle>) => Promise<unknown>,
): Promise<CapturedQuery[]> => {
  const captured: CapturedQuery[] = [];
  const db = drizzle(pool, {
    schema,
    casing: 'snake_case',
    logger: { logQuery: (text, params) => captured.push({ text, params }) },
  });
  await work(db as never);
  return captured;
};

const planOf = async (query: CapturedQuery): Promise<PlanNode> => {
  const result = await pool.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
    `EXPLAIN (FORMAT JSON) ${query.text}`,
    query.params,
  );
  const plan = result.rows[0]?.['QUERY PLAN'][0]?.Plan;
  if (!plan) throw new Error('EXPLAIN returned no plan');
  return plan;
};

/** The tables a plan reads with a sequential scan, however deep in the tree. */
const sequentiallyScanned = (node: PlanNode): string[] => [
  ...(node['Node Type'] === 'Seq Scan' && node['Relation Name'] ? [node['Relation Name']] : []),
  ...(node.Plans ?? []).flatMap(sequentiallyScanned),
];

/** ENF-PERF-04: tables the load dataset fills, which must never be read whole by a selective query. */
const LARGE_TABLES = new Set(['job_offers', 'applications', 'emails']);

beforeAll(async () => {
  await truncateAll(database);
  userId = await seedLoadDataset(database.db, pool, NOW);
  const [source] = await database.db
    .select({ id: schema.watchedSites.id })
    .from(schema.watchedSites)
    .limit(1);
  siteId = source?.id ?? 0;
}, 60_000);

afterAll(async () => {
  await pool.end();
  await database.close();
});

describe('watch queries on the load of ENF-PERF-01', () => {
  it.each([
    ['listSources', (db: never) => repository.listSources(db, userId)],
    ['listActiveSources', (db: never) => repository.listActiveSources(db, userId)],
    ['listKnownOfferIds', (db: never) => repository.listKnownOfferIds(db, siteId)],
    ['listUsersWithActiveSources', (db: never) => repository.listUsersWithActiveSources(db)],
  ])('[ENF-PERF-04] %s never reads a large table whole', async (_name, work) => {
    const queries = await capture(work as (db: ReturnType<typeof drizzle>) => Promise<unknown>);
    expect(queries.length).toBeGreaterThan(0);

    const scanned = new Set<string>();
    for (const query of queries) {
      for (const table of sequentiallyScanned(await planOf(query))) scanned.add(table);
    }

    expect([...scanned].filter((table) => LARGE_TABLES.has(table))).toEqual([]);
  });
});

describe('suggestion of sources on the load of ENF-PERF-01', () => {
  /*
   * `listSuggestionDomains` agrège **tous** les messages reçus du candidat pour compter leurs domaines : comme
   * les indicateurs du tableau de bord, elle lit par nature l'essentiel de la table, et un `Seq Scan` y est le
   * bon plan, pas un défaut (Q-17). Ce qui doit tenir, c'est son temps.
   */
  it(`[ENF-PERF-05] reads the domains of the candidate in less than ${MAX_EXECUTION_MS} ms`, async () => {
    const queries = await capture(((db: never) => repository.listSuggestionDomains(db, userId)) as never);
    expect(queries.length).toBeGreaterThan(0);

    for (const query of queries) {
      const result = await pool.query<{ 'QUERY PLAN': AnalyzedPlan[] }>(
        `EXPLAIN (ANALYZE, FORMAT JSON) ${query.text}`,
        query.params,
      );
      expect(result.rows[0]?.['QUERY PLAN'][0]?.['Execution Time'] ?? Infinity).toBeLessThan(MAX_EXECUTION_MS);
    }
  });
});
