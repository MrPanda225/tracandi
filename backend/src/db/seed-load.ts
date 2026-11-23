import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { count, eq, like } from 'drizzle-orm';
import { createLogger, type Logger } from '../lib/logger.js';
import { hashPassword, OWASP_SCRYPT_PARAMS } from '../modules/auth/password.js';
import { connectDatabase } from './client.js';
import { DEFAULT_SEED, DEFAULT_USERS, seedLoadDataset } from './loadDataset.js';
import { runMigrations } from './migrate.js';
import { companies, users } from './schema.js';

/** Password of the fictitious accounts `charge-N@example.test`, documented for the testers (never a real one). */
export const LOAD_PASSWORD = 'jeu de charge local';
// The fictitious accounts of `seedLoadDataset` (`charge-N@example.test`): a second run would mix two datasets.
const LOAD_EMAILS = 'charge-%@example.test';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** What the command line asks for. */
export interface SeedLoadRequest {
  url: string;
  seed: number;
  users: number;
  /** An existing, empty account to fill with the main volume (the tester's own account). */
  email: string | undefined;
}

/**
 * T-703: refuses any database that is not on this machine — the load never reaches Neon, whose data are real.
 * @throws Error naming the problem, never the URL (it carries a password).
 */
export const assertLocalDatabase = (url: string): void => {
  if (!URL.canParse(url)) throw new Error('LOAD_DATABASE_URL is not a valid URL');
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('LOAD_DATABASE_URL must use the postgresql:// scheme');
  }
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error('LOAD_DATABASE_URL must point to a local database (127.0.0.1): the load never goes to Neon');
  }
};

/**
 * Reads `LOAD_DATABASE_URL` and the options `--seed`, `--users`, `--email`.
 * @throws Error for a missing URL or an option that is not a positive integer.
 */
export const readSeedLoadRequest = (argv: readonly string[], env: NodeJS.ProcessEnv): SeedLoadRequest => {
  const { values } = parseArgs({
    args: [...argv],
    options: { seed: { type: 'string' }, users: { type: 'string' }, email: { type: 'string' } },
  });
  const url = env['LOAD_DATABASE_URL'] ?? '';
  if (!url) throw new Error('set LOAD_DATABASE_URL to the local database to fill');
  const integerOf = (value: string | undefined, fallback: number, name: string): number => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`--${name} must be a positive integer`);
    return parsed;
  };
  return {
    url,
    seed: integerOf(values.seed, DEFAULT_SEED, 'seed'),
    users: integerOf(values.users, DEFAULT_USERS, 'users'),
    email: values.email,
  };
};

/**
 * T-703: applies the migrations, then fills the local database with the load dataset. With `--email`, the tester's
 * existing account gets the main volume; otherwise fictitious accounts are created. A database already holding
 * companies for that account, or the fictitious accounts, is left untouched.
 * @returns the ids of the users filled.
 * @throws Error for a database that is not local, an unknown or non-empty account, or a failed insertion.
 * @req ENF-PERF-01
 */
export const seedLoad = async (request: SeedLoadRequest, logger: Logger): Promise<number[]> => {
  assertLocalDatabase(request.url);
  await runMigrations(request.url, logger);
  const handle = connectDatabase(request.url, logger);
  try {
    const { db } = handle;
    const [existing] = await db.select({ id: users.id }).from(users).where(like(users.email, LOAD_EMAILS)).limit(1);
    if (existing) throw new Error('the load dataset is already in this database');
    let mainUserId: number | undefined;
    if (request.email) {
      const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, request.email));
      if (!account) throw new Error('no account with this e-mail: create it in the application first');
      const [owned] = await db.select({ total: count() }).from(companies).where(eq(companies.userId, account.id));
      if ((owned?.total ?? 0) > 0) throw new Error('this account already holds applications: use an empty one');
      mainUserId = account.id;
    }
    const passwordHash = await hashPassword(LOAD_PASSWORD, OWASP_SCRYPT_PARAMS);
    return await seedLoadDataset(db, {
      now: new Date(),
      seed: request.seed,
      users: request.users,
      mainUserId,
      passwordHash,
    });
  } finally {
    await handle.close();
  }
};

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const logger = createLogger();
  Promise.resolve()
    .then(() => seedLoad(readSeedLoadRequest(process.argv.slice(2), process.env), logger))
    .then((userIds) => {
      logger.info('load dataset created', { users: userIds.length });
    })
    .catch((error: unknown) => {
      logger.error('load dataset failed', { error });
      process.exitCode = 1;
    });
}
