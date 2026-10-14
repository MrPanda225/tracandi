import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

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

const LOGIN_CODE_DIGITS = 6;

/**
 * New login challenge token, handed to the browser while it waits for the code: same construction as the session
 * token. Only its digest is stored.
 * @req ENF-SEC-26
 */
export const generateChallengeToken = (): string => createRandomToken();

/**
 * SHA-256 digest of a challenge token, the only form kept in the database.
 * @req ENF-SEC-26
 */
export const hashChallengeToken = (token: string): Buffer => digestOf(token);

/**
 * New six-digit login code, uniform over 000000-999999 (`randomInt` draws from a CSPRNG without modulo bias).
 * @req EF-AUT-16, ENF-SEC-26
 */
export const generateLoginCode = (): string =>
  randomInt(0, 10 ** LOGIN_CODE_DIGITS)
    .toString()
    .padStart(LOGIN_CODE_DIGITS, '0');

/**
 * Digest stored for a login code: SHA-256 of the raw challenge token and the code together. The token is never
 * stored, so a leaked table cannot be used to try the 10^6 possible codes offline, which a bare digest of a six-digit
 * code would allow.
 * @req ENF-SEC-26
 */
export const hashLoginCode = (challengeToken: string, code: string): Buffer =>
  digestOf(`${challengeToken}:${code}`);

/**
 * Constant-time comparison of two digests.
 * @req ENF-SEC-26
 */
export const digestsEqual = (left: Buffer, right: Buffer): boolean =>
  left.length === right.length && timingSafeEqual(left, right);
