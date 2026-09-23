import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_HEX_PATTERN = /^[0-9a-f]{64}$/i;
// NIST SP 800-38D: 96-bit IV for GCM, never reused with the same key (random per encryption).
const IV_BYTES = 12;

/** A secret sealed with AES-256-GCM: ciphertext, initialization vector and authentication tag. */
export interface SealedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/**
 * Reads a 256-bit key written as 64 hexadecimal characters (`openssl rand -hex 32`).
 * @throws Error when the value is not 64 hexadecimal characters; the message never contains the value.
 * @req ENF-SEC-02
 */
export const parseEncryptionKey = (hex: string): Buffer => {
  if (!KEY_HEX_PATTERN.test(hex)) throw new Error('must be 64 hexadecimal characters');
  return Buffer.from(hex, 'hex');
};

/**
 * Encrypts a secret at rest with AES-256-GCM and a fresh random IV (ENF-SEC-02).
 * @req ENF-SEC-02
 */
export const encryptSecret = (plaintext: string, key: Buffer): SealedSecret => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
};

/**
 * Decrypts a sealed secret.
 * @throws Error when the ciphertext, the IV or the tag was altered, or when the key is not the one used to encrypt.
 * @req ENF-SEC-02
 */
export const decryptSecret = ({ ciphertext, iv, tag }: SealedSecret, key: Buffer): string => {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
