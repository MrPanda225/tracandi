import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, parseEncryptionKey } from './crypto.js';

const KEY = randomBytes(32);
const TOKEN = '1//0g-fake-refresh-token-for-tests';

describe('encryptSecret / decryptSecret', () => {
  it('[ENF-SEC-02] gets the secret back after an AES-256-GCM round trip', () => {
    const sealed = encryptSecret(TOKEN, KEY);

    expect(decryptSecret(sealed, KEY)).toBe(TOKEN);
    expect(sealed.ciphertext.toString('utf8')).not.toContain(TOKEN);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.tag).toHaveLength(16);
  });

  it('[ENF-SEC-02] uses a new initialization vector each time', () => {
    expect(encryptSecret(TOKEN, KEY).iv.equals(encryptSecret(TOKEN, KEY).iv)).toBe(false);
  });

  it.each([
    [
      'ciphertext',
      (sealed: ReturnType<typeof encryptSecret>) => ({
        ...sealed,
        ciphertext: flipFirstBit(sealed.ciphertext),
      }),
    ],
    ['tag', (sealed: ReturnType<typeof encryptSecret>) => ({ ...sealed, tag: flipFirstBit(sealed.tag) })],
    [
      'initialization vector',
      (sealed: ReturnType<typeof encryptSecret>) => ({ ...sealed, iv: flipFirstBit(sealed.iv) }),
    ],
  ])('[ENF-SEC-02] detects an altered %s', (_part, alter) => {
    expect(() => decryptSecret(alter(encryptSecret(TOKEN, KEY)), KEY)).toThrow();
  });

  it('[ENF-SEC-02] refuses to decrypt with another key', () => {
    expect(() => decryptSecret(encryptSecret(TOKEN, KEY), randomBytes(32))).toThrow();
  });
});

describe('parseEncryptionKey', () => {
  it('[ENF-SEC-02] reads 64 hexadecimal characters as a 256-bit key', () => {
    expect(parseEncryptionKey('ab'.repeat(32))).toHaveLength(32);
  });

  it.each(['', 'ab'.repeat(31), 'zz'.repeat(32)])('[ENF-SEC-02] refuses %j', (value) => {
    expect(() => parseEncryptionKey(value)).toThrow('64 hexadecimal characters');
  });
});

function flipFirstBit(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  copy[0] = (copy[0] ?? 0) ^ 1;
  return copy;
}
