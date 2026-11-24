import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createLogger, sanitize, stackOf } from './logger.js';

const captureLines = () => {
  const lines: string[] = [];
  const logger = createLogger({
    write: (line) => lines.push(line),
    now: () => new Date('2026-09-22T08:00:00.000Z'),
  });
  return { lines, logger };
};

describe('sanitize', () => {
  it('[ENF-SEC-08] redacts values of sensitive keys at any depth', () => {
    const result = sanitize({
      password: 'p',
      nested: { apiKey: 'k', refresh_token: 't', authorization: 'Bearer x', body: 'mail body' },
      list: [{ clientSecret: 's' }],
      path: '/api/health',
    });

    expect(result).toEqual({
      password: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        refresh_token: '[REDACTED]',
        authorization: '[REDACTED]',
        body: '[REDACTED]',
      },
      list: [{ clientSecret: '[REDACTED]' }],
      path: '/api/health',
    });
  });

  it('[ENF-SEC-08] removes credentials embedded in connection strings', () => {
    const result = sanitize({
      detail: 'cannot reach postgresql://tracandi_app:s3cret@ep-x.neon.tech/db?sslmode=verify-full',
    });

    expect(JSON.stringify(result)).not.toContain('s3cret');
    expect(JSON.stringify(result)).toContain('postgresql://[REDACTED]@ep-x.neon.tech/db');
  });

  it('[ENF-SEC-08] serializes an Error as name and sanitized message', () => {
    const result = sanitize({ error: new Error('login failed for postgres://u:pw@host/db') });

    expect(result).toEqual({
      error: { name: 'Error', message: 'login failed for postgres://[REDACTED]@host/db' },
    });
  });
});

describe('a failed query in the journal', () => {
  it('[ENF-RGP-01] [ENF-SEC-08] writes no parameter of a failed query, in its message nor in its stack', () => {
    const { lines, logger } = captureLines();
    const failed = new DrizzleQueryError(
      'insert into "applications" ("company_id", "job_title", "notes") values ($1, $2, $3)',
      [12, 'Analyste données Nova', 'Relance prévue\n    chez Nova le 3'],
      new Error('deadlock detected'),
    );

    logger.error('unexpected error', { error: failed, stack: failed.stack });

    const [line = ''] = lines;
    expect(line).not.toMatch(/Nova|Analyste|Relance/u);
    const entry = JSON.parse(line) as { error: { message: string }; stack: string };
    expect(entry.error.message).toBe(
      'Failed query: insert into "applications" ("company_id", "job_title", "notes") values ($1, $2, $3)\n' +
        'params: [REDACTED]',
    );
    expect(entry.stack).toMatch(/params: \[REDACTED\]\n {4}at /u);
  });

  it('[ENF-RGP-01] [ENF-SEC-08] writes no parameter when a cell looks like a stack frame', () => {
    const { lines, logger } = captureLines();
    const failed = new DrizzleQueryError(
      'update "applications" set "notes" = $1 where "id" = $2',
      ['Relance prévue\n    at Nova SAS le 3 avec Mme Martin', 12],
      new Error('deadlock detected'),
    );

    logger.error('unexpected error', { error: failed, stack: stackOf(failed) });

    const [line = ''] = lines;
    expect(line).not.toMatch(/Nova|Martin|Relance/u);
    const entry = JSON.parse(line) as { error: { message: string }; stack: string };
    expect(entry.error.message).toBe(
      'Failed query: update "applications" set "notes" = $1 where "id" = $2\nparams: [REDACTED]',
    );
    expect(entry.stack).toMatch(/^Error: Failed query: .*\nparams: \[REDACTED\]\n {4}at /u);
  });
});

describe('createLogger', () => {
  it('[ENF-SEC-08] writes one JSON line per entry with level, time and sanitized context', () => {
    const { lines, logger } = captureLines();

    logger.info('request completed', { path: '/api/health', token: 'abc' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toEqual({
      level: 'info',
      time: '2026-09-22T08:00:00.000Z',
      message: 'request completed',
      path: '/api/health',
      token: '[REDACTED]',
    });
  });

  it('[ENF-SEC-08] sanitizes the message itself', () => {
    const { lines, logger } = captureLines();

    logger.error('failed on postgresql://a:b@h/d');

    expect(lines[0]).not.toContain(':b@');
  });
});
