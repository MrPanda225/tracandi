import { drizzle } from 'drizzle-orm/node-postgres';
import type pg from 'pg';
import * as schema from '../../src/db/schema.js';

/** An SQL statement as sent by Drizzle, with its parameters. */
export interface CapturedQuery {
  text: string;
  params: unknown[];
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  Plans?: PlanNode[];
}

/** ENF-PERF-04: tables the load dataset fills, which must never be read whole by a selective query. */
export const LARGE_TABLES = new Set(['job_offers', 'applications', 'emails']);

/** Runs `work` on its own Drizzle client and returns every SQL statement it sent. */
export const capture = async (
  pool: pg.Pool,
  work: (db: never) => Promise<unknown>,
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

const sequentiallyScanned = (node: PlanNode): string[] => [
  ...(node['Node Type'] === 'Seq Scan' && node['Relation Name'] ? [node['Relation Name']] : []),
  ...(node.Plans ?? []).flatMap(sequentiallyScanned),
];

/** The large tables the plans of these statements read whole (ENF-PERF-04), however deep in the tree. */
export const largeTablesScanned = async (pool: pg.Pool, queries: readonly CapturedQuery[]): Promise<string[]> => {
  const scanned = new Set<string>();
  for (const query of queries) {
    const result = await pool.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
      `EXPLAIN (FORMAT JSON) ${query.text}`,
      query.params,
    );
    const plan = result.rows[0]?.['QUERY PLAN'][0]?.Plan;
    if (!plan) throw new Error('EXPLAIN returned no plan');
    for (const table of sequentiallyScanned(plan)) scanned.add(table);
  }
  return [...scanned].filter((table) => LARGE_TABLES.has(table));
};
