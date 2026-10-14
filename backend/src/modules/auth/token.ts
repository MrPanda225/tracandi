import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** 256 random bits, base64url: safe in a cookie or a URL query string alike. */
const createRandomToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/** SHA-256 digest of a token, the only form ever kept in the database. */
const digestOf = (token: string): Buffer => createHash('sha256').update(token).digest();

/**
 * New session token: 256 random bits, base64url (safe in a cookie). Only its digest is stored.
 * @req ENF-SEC-20
 */
export const generateSessionToken = (): string => createRandomToken();

/**
 * SHA-256 digest of a session token, the only form kept in the database: a leaked table cannot open a session.
 * @req ENF-SEC-20
 */
export const hashSessionToken = (token: string): Buffer => digestOf(token);

/**
 * New activation token: same construction as the session token (ENF-SEC-26, "comme ENF-SEC-20") — 256 random bits,
 * base64url, safe as the `code` query parameter of the activation link.
 * @req ENF-SEC-26
 */
export const generateActivationToken = (): string => createRandomToken();

/**
 * SHA-256 digest of an activation token, the only form kept in the database.
 * @req ENF-SEC-26
 */
export const hashActivationToken = (token: string): Buffer => digestOf(token);
