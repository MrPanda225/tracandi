import { describe, expect, it } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { runMigrations } from './migrate.js';

const silent = createLogger({ write: () => undefined });

describe('runMigrations', () => {
  it('[ENF-SEC-15] names DATABASE_URL_MIGRATOR by default when the URL is refused, never the URL', async () => {
    await expect(runMigrations('pas une adresse secrète', silent)).rejects.toThrow(
      'DATABASE_URL_MIGRATOR is not a valid URL',
    );
  });

  it('[ENF-PERF-01] names the variable the URL actually comes from', async () => {
    const neon = 'postgresql://u:secret@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require';
    const failure = runMigrations(neon, silent, 'LOAD_DATABASE_URL');
    await expect(failure).rejects.toThrow(/^LOAD_DATABASE_URL must contain sslmode=verify-full/u);
    await expect(failure).rejects.not.toThrow(/DATABASE_URL_MIGRATOR|secret/u);
  });
});
