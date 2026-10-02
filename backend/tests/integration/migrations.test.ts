import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/db/migrate.js';
import { createLogger } from '../../src/lib/logger.js';
import { createTestContext, openTestDatabase } from './context.js';
import { testDatabaseUrl } from './test-database.js';

const database = openTestDatabase();
const JOURNAL_FILE = new URL('../../drizzle/meta/_journal.json', import.meta.url);

/** Number of migrations versioned in `drizzle/`, as listed by drizzle-kit's journal. */
const versionedMigrationCount = (): number =>
  (JSON.parse(readFileSync(JOURNAL_FILE, 'utf8')) as { entries: unknown[] }).entries.length;

afterAll(async () => {
  await database.close();
});

const EXPECTED_TABLES = [
  'app_settings',
  'application_status_history',
  'applications',
  'candidate_profiles',
  'companies',
  'cv_keywords',
  'cv_types',
  'cv_versions',
  'discovered_sources',
  'dismissed_source_suggestions',
  'emails',
  'gmail_accounts',
  'gmail_labels',
  'job_offers',
  'job_run_counters',
  'job_runs',
  'llm_calls',
  'llm_model_prices',
  'platform_domains',
  'platforms',
  'prefilter_keywords',
  'processed_messages',
  'sessions',
  'users',
  'watch_criteria',
  'watched_sites',
];

describe('migrations', () => {
  it('[ENF-MAI-05] creates every table of the data model from the versioned migrations', async () => {
    const result = await database.db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
  });

  it('[ENF-MAI-05] is idempotent: a second run applies nothing and keeps the journal unchanged', async () => {
    const countJournal = async () =>
      (
        await database.db.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
        )
      ).rows[0]?.n;
    const before = await countJournal();

    await runMigrations(testDatabaseUrl(), createLogger({ write: () => undefined }));

    expect(await countJournal()).toBe(before);
    expect(before).toBe(versionedMigrationCount());
  });

  it('[EF-DOC-01] documents every route mounted by the modules', async () => {
    const { app } = createTestContext(database);
    const document = (await request(app).get('/api/openapi.json')).body as {
      paths: Record<string, Record<string, unknown>>;
    };

    const documented = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(documented.sort()).toEqual(
      [
        'GET /health',
        'POST /auth/register',
        'POST /auth/login',
        'POST /auth/logout',
        'GET /auth/session',
        'GET /auth/me',
        'DELETE /auth/account',
        'GET /account/export',
        'GET /applications',
        'POST /applications',
        'GET /applications/{id}',
        'PATCH /applications/{id}',
        'DELETE /applications/{id}',
        'GET /applications/{id}/emails',
        'PATCH /emails/{id}',
        'GET /stats/dashboard',
        'GET /gmail/authorization-url',
        'GET /gmail/callback',
        'GET /gmail/status',
        'PATCH /gmail/settings',
        'POST /gmail/sync',
        'POST /gmail/reclassify',
        'POST /applications/{id}/follow-up-draft',
        'GET /settings/ai',
        'GET /settings/features',
        'GET /profile',
        'PUT /profile',
        'POST /cv-workshop/analyses',
        'GET /cv-workshop/analyses/{id}',
        'POST /cv-workshop/analyses/{id}/docx',
        'GET /jobs/{id}',
        'GET /jobs/stream',
        'DELETE /gmail/connection',
        'GET /sites',
        'GET /sites/types',
        'GET /sites/suggestions',
        'POST /sites/suggestions/{companyId}/dismiss',
        'POST /sites',
        'PATCH /sites/{id}',
        'DELETE /sites/{id}',
        'POST /sites/run',
        'POST /sites/suggestions/discover',
        'GET /offers',
        'GET /offers/{id}',
        'PATCH /offers/{id}',
        'POST /offers/{id}/apply',
        'GET /cv-types',
        'POST /cv-types',
        'PUT /cv-types/{id}',
        'GET /cv-types/{id}/deduction',
        'DELETE /cv-types/{id}',
        'GET /watch/automatic',
        'PUT /watch/automatic',
        'GET /watch/criteria',
        'PUT /watch/criteria',
        'POST /watch/criteria/validation',
        'GET /watch/places',
      ].sort(),
    );
  });
});
