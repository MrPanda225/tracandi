import { describe, expect, it } from 'vitest';
import { createLogger, sanitize } from './logger.js';

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
