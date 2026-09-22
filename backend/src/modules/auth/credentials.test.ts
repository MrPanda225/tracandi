import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken } from './token.js';

// Low cost for fast tests; production uses OWASP_SCRYPT_PARAMS.
const TEST_PARAMS = { cost: 2 ** 10, blockSize: 8, parallelization: 1 };

describe('hashPassword / verifyPassword', () => {
  it('[ENF-SEC-18] stores a salted scrypt hash that never contains the password', async () => {
    const hash = await hashPassword('une phrase de passe longue', TEST_PARAMS);

    expect(hash).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(hash).not.toContain('phrase');
  });

  it('[ENF-SEC-18] produces a different hash for the same password (random salt)', async () => {
    const [first, second] = await Promise.all([
      hashPassword('une phrase de passe longue', TEST_PARAMS),
      hashPassword('une phrase de passe longue', TEST_PARAMS),
    ]);

    expect(first).not.toBe(second);
  });

  it('[ENF-SEC-18] accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('une phrase de passe longue', TEST_PARAMS);

    await expect(verifyPassword('une phrase de passe longue', hash)).resolves.toBe(true);
    await expect(verifyPassword('une phrase de passe longuE', hash)).resolves.toBe(false);
  });

  it('[ENF-SEC-18] rejects a malformed stored hash without throwing', async () => {
    await expect(verifyPassword('x', 'plain-text')).resolves.toBe(false);
  });
});

describe('session tokens', () => {
  it('[ENF-SEC-20] generates 256-bit random tokens', () => {
    const token = generateSessionToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generateSessionToken()).not.toBe(token);
  });

  it('[ENF-SEC-20] stores only a SHA-256 digest, stable for the same token', () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toHaveLength(32);
    expect(hashSessionToken(token).equals(hashSessionToken(token))).toBe(true);
    expect(hashSessionToken(token).toString('base64url')).not.toBe(token);
  });
});
