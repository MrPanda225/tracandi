import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** scrypt cost parameters (N, r, p). */
export interface ScryptParams {
  cost: number;
  blockSize: number;
  parallelization: number;
}

/*
 * ENF-SEC-18: OWASP setting for scrypt of the same strength as N = 2^17, p = 1, with a quarter of its memory: 32 MiB
 * per hash instead of 128. The hosting container has 256 MB, and each login derives a key (BES-39).
 */
export const OWASP_SCRYPT_PARAMS: ScryptParams = { cost: 2 ** 15, blockSize: 8, parallelization: 3 };

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_MEMORY_FACTOR = 128;
const MEMORY_HEADROOM = 2;
const HASH_PREFIX = 'scrypt';

const deriveKey = (password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const options = {
      N: params.cost,
      r: params.blockSize,
      p: params.parallelization,
      maxmem: SCRYPT_MEMORY_FACTOR * params.cost * params.blockSize * MEMORY_HEADROOM,
    };
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

/**
 * Hashes a password with a random salt. The result embeds the parameters, so they can be raised later
 * without invalidating existing hashes: `scrypt$N$r$p$salt$hash` (base64).
 * @req ENF-SEC-18
 */
export const hashPassword = async (password: string, params: ScryptParams): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, params);
  const { cost, blockSize, parallelization } = params;
  return [
    HASH_PREFIX,
    cost,
    blockSize,
    parallelization,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$');
};

/**
 * Checks a password against a stored hash in constant time. Returns false for a malformed hash instead of throwing.
 * @req ENF-SEC-18
 */
export const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [prefix, cost, blockSize, parallelization, salt, expected] = storedHash.split('$');
  if (prefix !== HASH_PREFIX || !salt || !expected) return false;
  const params = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  const expectedKey = Buffer.from(expected, 'base64');
  const key = await deriveKey(password, Buffer.from(salt, 'base64'), params);
  return key.length === expectedKey.length && timingSafeEqual(key, expectedKey);
};
