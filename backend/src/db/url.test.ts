import { describe, expect, it } from 'vitest';
import { describeDatabaseUrlProblem } from './url.js';

describe('describeDatabaseUrlProblem', () => {
  it('[ENF-SEC-15] accepts a remote database with verified TLS', () => {
    expect(
      describeDatabaseUrlProblem(
        'postgresql://app:pw@ep-x.eu-central-1.aws.neon.tech/db?sslmode=verify-full',
      ),
    ).toBeNull();
  });

  it.each([
    'postgresql://app:pw@ep-x.neon.tech/db',
    'postgresql://app:pw@ep-x.neon.tech/db?sslmode=require',
    'postgresql://app:pw@ep-x.neon.tech/db?sslmode=disable',
  ])('[ENF-SEC-15] refuses a remote database without sslmode=verify-full: %s', (url) => {
    expect(describeDatabaseUrlProblem(url)).toMatch(/verify-full/);
  });

  it('[ENF-SEC-15] allows the local test database without TLS (ADR-12)', () => {
    expect(describeDatabaseUrlProblem('postgresql://t:t@127.0.0.1:5432/tracandi_test')).toBeNull();
  });

  it.each([
    ['not a url', /valid URL/],
    ['mysql://u:p@host/db', /postgresql:\/\//],
  ])('[ENF-SEC-15] rejects %j', (url, reason) => {
    expect(describeDatabaseUrlProblem(url)).toMatch(reason);
  });

  it('[ENF-SEC-08] never includes the URL (and its password) in the reason', () => {
    expect(describeDatabaseUrlProblem('postgresql://app:s3cret@neon.tech/db')).not.toContain('s3cret');
  });
});
