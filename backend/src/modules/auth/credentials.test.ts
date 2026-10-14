import { describe, expect, it } from 'vitest';
import { hashPassword, OWASP_SCRYPT_PARAMS, verifyPassword } from './password.js';
import {
  generateActivationToken,
  generateSessionToken,
  hashActivationToken,
  hashSessionToken,
} from './token.js';

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

describe('activation tokens', () => {
  it('[ENF-SEC-26] generates 256-bit random tokens', () => {
    const token = generateActivationToken();

    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generateActivationToken()).not.toBe(token);
  });

  it('[ENF-SEC-26] stores only a SHA-256 digest, stable for the same token', () => {
    const token = generateActivationToken();

    expect(hashActivationToken(token)).toHaveLength(32);
    expect(hashActivationToken(token).equals(hashActivationToken(token))).toBe(true);
    expect(hashActivationToken(token).toString('base64url')).not.toBe(token);
  });
});

describe('OWASP_SCRYPT_PARAMS', () => {
  // OWASP Password Storage Cheat Sheet: settings of equal strength, from N = 2^17, p = 1 down to N = 2^13, p = 10.
  const OWASP_EQUIVALENTS = [
    [2 ** 17, 1],
    [2 ** 16, 2],
    [2 ** 15, 3],
    [2 ** 14, 5],
    [2 ** 13, 10],
  ];
  const MIB = 1024 * 1024;

  it('[ENF-SEC-18] is one of the OWASP settings for scrypt', () => {
    const { cost, blockSize, parallelization } = OWASP_SCRYPT_PARAMS;

    expect(blockSize).toBe(8);
    expect(OWASP_EQUIVALENTS).toContainEqual([cost, parallelization]);
  });

  it('[ENF-SEC-18] [BES-39] needs at most 32 MiB per hash, so that a 256 MB container survives a login', () => {
    const { cost, blockSize } = OWASP_SCRYPT_PARAMS;

    expect(128 * cost * blockSize).toBeLessThanOrEqual(32 * MIB);
  });
});
