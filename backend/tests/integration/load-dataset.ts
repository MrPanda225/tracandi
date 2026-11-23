import type pg from 'pg';
import type { Database } from '../../src/db/client.js';
import { seedLoadDataset as seedDatabase } from '../../src/db/loadDataset.js';

/**
 * Fills an empty test database with the T-703 load dataset (`src/db/loadDataset.ts`): the ENF-PERF-01 volume for
 * the main user — 1 000 applications over 12 months, 10 000 messages, 5 000 offers — and a tenth of it for two other
 * users, then refreshes the planner statistics. Returns the id of the main user.
 */
export const seedLoadDataset = async (db: Database, _pool: pg.Pool, now: Date): Promise<number> => {
  const [mainUserId] = await seedDatabase(db, { now, passwordHash: 'not-a-real-hash' });
  if (mainUserId === undefined) throw new Error('load dataset without user');
  return mainUserId;
};
