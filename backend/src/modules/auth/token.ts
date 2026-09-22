import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/**
 * New session token: 256 random bits, base64url (safe in a cookie). Only its digest is stored.
 * @req ENF-SEC-20
 */
export const generateSessionToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * SHA-256 digest of a session token, the only form kept in the database: a leaked table cannot open a session.
 * @req ENF-SEC-20
 */
export const hashSessionToken = (token: string): Buffer => createHash('sha256').update(token).digest();
