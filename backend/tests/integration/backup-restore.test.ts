import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase, type DatabaseHandle } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { applications, companies, users } from '../../src/db/schema.js';
import { createLogger } from '../../src/lib/logger.js';
import { testDatabaseUrl } from './test-database.js';

// T-701 : scripts/db/ joués pour de vrai contre le PostgreSQL LOCAL de test (ADR-12), jamais contre Neon.
// Chaque script reçoit un environnement minimal et un fichier de réglages vide : il ne lit jamais le vrai .env.

const SCRIPTS = fileURLToPath(new URL('../../../scripts/db/', import.meta.url));
const ROLE_SQL = path.join(SCRIPTS, 'backup-role.sql');
const SOURCE_DB = 'tracandi_backup_source';
const CHECK_DB = 'tracandi_restore_check_test';
const TARGET_DB = 'tracandi_restore_target';
// A database without any table: its archive must be refused (EXIT_VERIFY).
const EMPTY_DB = 'tracandi_backup_empty';
// Mot de passe fictif du rôle de sauvegarde local : il ne doit jamais apparaître dans un journal.
const BACKUP_PASSWORD = 'fictive-backup-pw-7Qx';
const SCRIPT_TIMEOUT_MS = 120_000;
const ARCHIVE_NAME = /^tracandi_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump$/;

const testUrl = new URL(testDatabaseUrl());
const urlFor = (database: string, user = testUrl.username, password = testUrl.password): string => {
  const url = new URL(testUrl);
  url.pathname = `/${database}`;
  url.username = user;
  url.password = password;
  return url.toString();
};

const silentLogger = createLogger({ write: () => undefined });
let workDir = '';
let backupDir = '';
let emptyEnvFile = '';
const handles: DatabaseHandle[] = [];

const open = (database: string): DatabaseHandle => {
  const handle = connectDatabase(urlFor(database), silentLogger);
  handles.push(handle);
  return handle;
};

/** Runs SQL statements on the `postgres` maintenance database of the local server (no user value interpolated). */
const admin = async (...statements: string[]): Promise<void> => {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  await client.connect();
  try {
    for (const statement of statements) await client.query(statement);
  } finally {
    await client.end();
  }
};

type ScriptResult = { status: number | null; output: string };

type ScriptRun = { args?: string[]; settings?: Record<string, string>; input?: string };

/** Runs one script of scripts/db/ with only the given settings (plus PATH and HOME), never the real .env. */
const runScript = (
  script: string,
  { args = [], settings = {}, input = '' }: ScriptRun = {},
): ScriptResult => {
  const result = spawnSync('bash', [path.join(SCRIPTS, script), ...args], {
    input,
    encoding: 'utf8',
    timeout: SCRIPT_TIMEOUT_MS,
    env: {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: process.env['HOME'] ?? workDir,
      TRACANDI_ENV_FILE: emptyEnvFile,
      TEST_DB_HOST: testUrl.hostname,
      TEST_DB_PORT: testUrl.port || '5432',
      TEST_DB_USER: decodeURIComponent(testUrl.username),
      TEST_DB_PASSWORD: decodeURIComponent(testUrl.password),
      TEST_DB_NAME: testUrl.pathname.slice(1),
      BACKUP_DIR: backupDir,
      ...settings,
    },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

const backupUrl = urlFor(SOURCE_DB, 'tracandi_backup', BACKUP_PASSWORD);
const runBackup = (settings: Record<string, string> = {}): ScriptResult =>
  runScript('backup.sh', { settings: { DATABASE_URL_BACKUP: backupUrl, ...settings } });

const archives = (): string[] =>
  readdirSync(backupDir)
    .filter((name) => ARCHIVE_NAME.test(name))
    .sort();

const latestArchive = (): string => {
  const latest = archives().at(-1);
  if (!latest) throw new Error('no archive');
  return path.join(backupDir, latest);
};

const rowCounts = async (database: string): Promise<{ users: number; applications: number }> => {
  const { db } = open(database);
  return { users: await db.$count(users), applications: await db.$count(applications) };
};

/** Fictitious data only: two accounts, their companies and applications. */
const seedSource = async (): Promise<void> => {
  const { db } = open(SOURCE_DB);
  const [alice, bob] = await db
    .insert(users)
    .values([
      { email: 'alice@example.test', passwordHash: 'scrypt$fictive' },
      { email: 'bob@example.test', passwordHash: 'scrypt$fictive' },
    ])
    .returning({ id: users.id });
  if (!alice || !bob) throw new Error('seed failed');
  const [nova, orion] = await db
    .insert(companies)
    .values([
      { userId: alice.id, name: 'Atelier Nova', nameKey: 'atelier nova' },
      { userId: bob.id, name: 'Orion Conseil', nameKey: 'orion conseil' },
    ])
    .returning({ id: companies.id });
  if (!nova || !orion) throw new Error('seed failed');
  await db.insert(applications).values([
    { companyId: nova.id, jobTitle: 'Data analyst', jobTitleKey: 'data analyst', source: 'manual' },
    { companyId: nova.id, jobTitle: 'Analyste BI', jobTitleKey: 'analyste bi', source: 'email' },
    { companyId: orion.id, jobTitle: 'Consultant', jobTitleKey: 'consultant', source: 'manual' },
  ]);
};

beforeAll(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'tracandi-t701-'));
  backupDir = path.join(workDir, 'backups');
  emptyEnvFile = path.join(workDir, 'empty.env');
  writeFileSync(emptyEnvFile, '');
  await admin(
    `DROP DATABASE IF EXISTS ${SOURCE_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${EMPTY_DB} WITH (FORCE)`,
    `CREATE DATABASE ${EMPTY_DB}`,
    `CREATE DATABASE ${SOURCE_DB}`,
    `CREATE DATABASE ${TARGET_DB}`,
    // Local stand-in of the Neon role (ARCHITECTURE.md §5): login, no attribute, rights from backup-role.sql only.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tracandi_backup') THEN CREATE ROLE tracandi_backup LOGIN; END IF;
     END $$`,
    `ALTER ROLE tracandi_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${BACKUP_PASSWORD}'`,
  );
  await runMigrations(urlFor(SOURCE_DB), silentLogger);
  await seedSource();
  const owner = new pg.Client({ connectionString: urlFor(SOURCE_DB) });
  await owner.connect();
  try {
    await owner.query(readFileSync(ROLE_SQL, 'utf8'));
  } finally {
    await owner.end();
  }
}, SCRIPT_TIMEOUT_MS);

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
  await admin(
    `DROP DATABASE IF EXISTS ${SOURCE_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${CHECK_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${TARGET_DB} WITH (FORCE)`,
    `DROP DATABASE IF EXISTS ${EMPTY_DB} WITH (FORCE)`,
    // The role is global to the server: removed once the databases holding its grants are gone.
    'DROP ROLE IF EXISTS tracandi_backup',
  );
  rmSync(workDir, { recursive: true, force: true });
});

describe('T-701 scripts/db (PostgreSQL)', () => {
  // BACKUP_DIR does not exist yet: an unplugged external disk is an error, never a silent fallback elsewhere.
  it('[ENF-FIA-04] refuses a missing backup directory instead of writing elsewhere (external disk unplugged)', () => {
    const result = runBackup();
    expect(result.status).toBe(2);
    expect(result.output).toContain('BACKUP_DIR does not exist');
  });

  it('[ENF-SEC-15] refuses a remote URL without sslmode=verify-full and never logs the password', () => {
    const result = runScript('backup.sh', {
      settings: {
        BACKUP_DIR: workDir,
        DATABASE_URL_BACKUP: `postgresql://tracandi_backup:${BACKUP_PASSWORD}@db.example.test/tracandi?sslmode=require`,
      },
    });
    expect(result.status).toBe(2);
    expect(result.output).toContain('sslmode=verify-full');
    expect(result.output).not.toContain(BACKUP_PASSWORD);
  });

  it('[ENF-SEC-15] reads .env without running it: a $(…) line is a plain, refused value', () => {
    const marker = path.join(workDir, 'executed');
    const envFile = path.join(workDir, 'hostile.env');
    writeFileSync(envFile, `DATABASE_URL_BACKUP=$(touch ${marker})\n`);
    const result = runScript('backup.sh', { settings: { BACKUP_DIR: workDir, TRACANDI_ENV_FILE: envFile } });
    expect(result.status).toBe(2);
    expect(result.output).toContain('DATABASE_URL_BACKUP is not a valid postgresql:// URL');
    expect(existsSync(marker)).toBe(false);
  });

  it('[ENF-SEC-15] refuses a URL whose parameters name another server or repeat sslmode', () => {
    const local = urlFor(SOURCE_DB, 'tracandi_backup', BACKUP_PASSWORD);
    const remote = `postgresql://tracandi_backup:${BACKUP_PASSWORD}@db.example.test/tracandi`;
    for (const url of [
      `${local}?host=db.example.test`,
      `${local}?hostaddr=192.0.2.1`,
      `${remote}?sslmode=verify-full&sslmode=disable`,
    ]) {
      const result = runScript('backup.sh', { settings: { BACKUP_DIR: workDir, DATABASE_URL_BACKUP: url } });
      expect(result.status, url).toBe(2);
      expect(result.output).not.toContain(BACKUP_PASSWORD);
    }
  });

  it('[ENF-FIA-08] refuses the root directory as backup directory', () => {
    const result = runBackup({ BACKUP_DIR: '/' });
    expect(result.status).toBe(2);
    expect(result.output).toContain('BACKUP_DIR must not be the root directory');
  });

  it('[ENF-FIA-04] dumps the database with the read-only backup role into a timestamped custom archive', () => {
    // BACKUP_DIR is created by the operator (or is the mounted external disk).
    mkdirSync(backupDir);
    const result = runBackup();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Backup OK: .*tracandi_\S+\.dump tables=\d+/);
    expect(result.output).not.toContain(BACKUP_PASSWORD);
    expect(readFileSync(path.join(backupDir, 'backup.log'), 'utf8')).not.toContain(BACKUP_PASSWORD);
    expect(archives()).toHaveLength(1);
    // Custom format of pg_dump: the file starts with the PGDMP signature.
    expect(readFileSync(latestArchive()).subarray(0, 5).toString()).toBe('PGDMP');
  });

  it('[ENF-FIA-04] refuses the archive of a database without any table, with code 4, and keeps nothing', () => {
    const before = readdirSync(backupDir);
    const result = runBackup({ DATABASE_URL_BACKUP: urlFor(EMPTY_DB, 'tracandi_backup', BACKUP_PASSWORD) });
    expect(result.status, result.output).toBe(4);
    expect(result.output).toContain('archive is empty or unreadable (tables=0)');
    expect(readdirSync(backupDir).filter((name) => name !== 'backup.log')).toEqual(
      before.filter((name) => name !== 'backup.log'),
    );
  });

  it('[ENF-SEC-17] the backup role can read but not write', async () => {
    const client = new pg.Client({ connectionString: backupUrl });
    await client.connect();
    try {
      const read = await client.query<{ count: string }>('SELECT count(*) AS count FROM users');
      expect(Number(read.rows[0]?.count)).toBe(2);
      await expect(client.query("DELETE FROM users WHERE email = 'alice@example.test'")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await client.end();
    }
  });

  it('[ENF-FIA-05] [ENF-FIA-07] restores the latest archive into a throwaway local database, same tables and rows, duration shown', async () => {
    const result = runScript('restore-check.sh', { settings: { CHECK_DB, KEEP_CHECK_DB: '1' } });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Restore check OK in \d+\.\d{3} s: tables=(\d+)\/\1 /);
    expect(result.output).toContain('users=2 applications=3');
    expect(readFileSync(path.join(backupDir, 'backup.log'), 'utf8')).toContain('Restore check OK');
    expect(await rowCounts(CHECK_DB)).toEqual(await rowCounts(SOURCE_DB));
  });

  it('[ENF-FIA-05] fails with code 4 on an unreadable archive and on fewer tables than expected', () => {
    const garbage = path.join(workDir, 'garbage.dump');
    writeFileSync(garbage, 'not a pg_dump archive');
    const unreadable = runScript('restore-check.sh', { args: [garbage], settings: { CHECK_DB } });
    expect(unreadable.status, unreadable.output).toBe(4);
    expect(unreadable.output).toContain('archive is unreadable');
    const tooFew = runScript('restore-check.sh', { settings: { CHECK_DB, EXPECTED_MIN_TABLES: '999' } });
    expect(tooFew.status, tooFew.output).toBe(4);
    expect(tooFew.output).toContain('expected >= 999');
  });

  it('[ENF-FIA-05] never restores into the integration test database nor into a remote host', () => {
    expect(runScript('restore-check.sh', { settings: { CHECK_DB: testUrl.pathname.slice(1) } }).status).toBe(
      2,
    );
    expect(
      runScript('restore-check.sh', { settings: { CHECK_DB, TEST_DB_HOST: 'db.example.test' } }).status,
    ).toBe(2);
  });

  it('[ENF-FIA-08] keeps 30 days of archives: older ones are removed after a successful backup', () => {
    const old = 'tracandi_2020-01-01T00-00-00Z.dump';
    const recentStamp = new Date(Date.now() - 2 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 19)
      .replaceAll(':', '-');
    const recent = `tracandi_${recentStamp}Z.dump`;
    writeFileSync(path.join(backupDir, old), 'old');
    writeFileSync(path.join(backupDir, recent), 'recent');
    const result = runBackup();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(`Retention: removed ${old}`);
    expect(archives()).not.toContain(old);
    expect(archives()).toContain(recent);
    rmSync(path.join(backupDir, recent));
  });

  // pg_dump of the workstation older than 18 (CI runner: 16) → tools of the postgres:18 image, streamed over stdio.
  it(
    '[ENF-FIA-04] [ENF-FIA-05] falls back to the PostgreSQL 18 tools of the Docker image',
    () => {
      const backup = runBackup({ PG_CLIENT: 'docker' });
      expect(backup.status, backup.output).toBe(0);
      expect(backup.output).toContain('client=docker');
      expect(backup.output).not.toContain(BACKUP_PASSWORD);
      const check = runScript('restore-check.sh', { settings: { CHECK_DB, PG_CLIENT: 'docker' } });
      expect(check.status, check.output).toBe(0);
      expect(check.output).toContain('users=2 applications=3');
      // Two containers per script and per call: slower than the default 30 s of the integration project.
    },
    SCRIPT_TIMEOUT_MS,
  );

  it('[ENF-FIA-07] restore.sh refuses without --yes-i-know and without the double confirmation', async () => {
    const settings = { RESTORE_DATABASE_URL: urlFor(TARGET_DB) };
    const args = ['--yes-i-know', '--no-owner', latestArchive()];
    const refused = runScript('restore.sh', { args: [latestArchive()], settings });
    expect(refused.status).toBe(1);
    expect(refused.output).toContain('--yes-i-know');
    const wrongName = runScript('restore.sh', { args, settings, input: 'neondb\n' });
    expect(wrongName.status).toBe(1);
    const noFinalWord = runScript('restore.sh', { args, settings, input: `${TARGET_DB}\noui\n` });
    expect(noFinalWord.status).toBe(1);
    expect(noFinalWord.output).toContain('nothing was changed');
    const tables = await open(TARGET_DB).db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public'`,
    );
    expect(tables.rows).toEqual([{ n: '0' }]);
  });

  it('[ENF-FIA-07] restore.sh replaces the target after both confirmations and keeps a safety dump', async () => {
    const result = runScript('restore.sh', {
      args: ['--yes-i-know', '--no-owner', latestArchive()],
      settings: { RESTORE_DATABASE_URL: urlFor(TARGET_DB) },
      input: `${TARGET_DB}\nRESTAURER\n`,
    });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toMatch(/Restore done in \d+\.\d{3} s: tracandi_restore_target tables=\d+ users=2/);
    expect(readdirSync(backupDir).some((name) => name.startsWith('pre-restore_tracandi_'))).toBe(true);
    expect(await rowCounts(TARGET_DB)).toEqual(await rowCounts(SOURCE_DB));
  });
});
