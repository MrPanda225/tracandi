import { count } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { companies, users } from '../../src/db/schema.js';
import { seedLoad, type SeedLoadRequest } from '../../src/db/seed-load.js';
import { createLogger } from '../../src/lib/logger.js';
import { openTestDatabase, truncateAll } from './context.js';
import { testDatabaseUrl } from './test-database.js';

/** T-703: the guards of `seedLoad`, which leave a database it should not fill untouched. */
const database = openTestDatabase();
const silent = createLogger({ write: () => undefined });
const TESTER = 'testeuse@example.test';

const requestFor = (email?: string): SeedLoadRequest => ({ url: testDatabaseUrl(), seed: 1, users: 1, email });

const insertUser = async (email: string): Promise<number> => {
  const [row] = await database.db
    .insert(users)
    .values({ email, passwordHash: 'not-a-real-hash', activatedAt: new Date() })
    .returning({ id: users.id });
  if (!row) throw new Error('user not inserted');
  return row.id;
};

const totals = async (): Promise<{ users: number; companies: number }> => {
  const [userTotal] = await database.db.select({ total: count() }).from(users);
  const [companyTotal] = await database.db.select({ total: count() }).from(companies);
  return { users: userTotal?.total ?? 0, companies: companyTotal?.total ?? 0 };
};

beforeEach(async () => {
  await truncateAll(database);
});

afterAll(async () => {
  await database.close();
});

describe('seedLoad guards', () => {
  it('[ENF-PERF-01] refuses a database that already holds the load dataset, and adds nothing', async () => {
    await insertUser('charge-1@example.test');
    await expect(seedLoad(requestFor(), silent)).rejects.toThrow('the load dataset is already in this database');
    expect(await totals()).toEqual({ users: 1, companies: 0 });
  });

  it('[ENF-PERF-01] refuses an --email no account has, and adds nothing', async () => {
    await insertUser(TESTER);
    await expect(seedLoad(requestFor('inconnue@example.test'), silent)).rejects.toThrow(
      'no account with this e-mail',
    );
    expect(await totals()).toEqual({ users: 1, companies: 0 });
  });

  it('[ENF-PERF-01] refuses an account that already holds applications, and adds nothing', async () => {
    const testerId = await insertUser(TESTER);
    await database.db.insert(companies).values({ userId: testerId, name: 'Exemple SA', nameKey: 'exemple sa' });
    await expect(seedLoad(requestFor(TESTER), silent)).rejects.toThrow('this account already holds applications');
    expect(await totals()).toEqual({ users: 1, companies: 1 });
  });
});
