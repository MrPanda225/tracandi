import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { hashPassword, type ScryptParams, verifyPassword } from './password.js';
import * as repository from './repository.js';
import type { Account, Credentials } from './schemas.js';
import { generateSessionToken, hashSessionToken } from './token.js';

// EF-AUT-07
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * ENF-PERF-01: every request resolves its cookie, so each one paid a round trip to the hosted database before doing
 * any work of its own. A session already resolved is kept in memory for this long; a logout drops it at once
 * (EF-AUT-04), and its own expiry is kept, so no session lives a second longer than EF-AUT-07 allows.
 */
export const SESSION_CACHE_MS = 60_000;

/** Opened session: the raw token goes into the cookie and nowhere else. */
export interface OpenedSession {
  userId: number;
  token: string;
  expiresAt: Date;
}

/** Account and session use cases (EF-AUT-01 to 08). */
export interface AuthService {
  register(credentials: Credentials): Promise<OpenedSession>;
  login(credentials: Credentials): Promise<OpenedSession>;
  logout(token: string): Promise<void>;
  authenticate(token: string): Promise<number | null>;
  getAccount(userId: number): Promise<Account>;
}

interface AuthServiceDeps {
  db: Database;
  clock: Clock;
  passwordParams: ScryptParams;
}

const INVALID_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect';

/**
 * Creates the authentication service.
 * Login answers identically for an unknown email and a wrong password, and spends the same hashing time in both
 * cases (ENF-SEC-19). Passwords and tokens are never logged nor returned.
 * @req EF-AUT-01, EF-AUT-03, EF-AUT-04, EF-AUT-07, EF-AUT-08, ENF-SEC-18, ENF-SEC-19, ENF-SEC-20, ENF-PERF-01
 */
export const createAuthService = ({ db, clock, passwordParams }: AuthServiceDeps): AuthService => {
  // Hash of a random password, checked when the email is unknown, so that timing does not reveal accounts.
  const decoyHash = hashPassword(generateSessionToken(), passwordParams);
  // Sessions resolved recently, by the hexadecimal digest of their token: the raw token is never kept.
  const resolved = new Map<string, { userId: number; expiresAt: Date; readAt: number }>();

  const openSession = async (userId: number): Promise<OpenedSession> => {
    const token = generateSessionToken();
    const expiresAt = new Date(clock().getTime() + SESSION_LIFETIME_MS);
    await repository.insertSession(db, { userId, tokenHash: hashSessionToken(token), expiresAt });
    return { userId, token, expiresAt };
  };

  return {
    async register({ email, password }) {
      const passwordHash = await hashPassword(password, passwordParams);
      try {
        return await openSession(await repository.insertUserWithSettings(db, { email, passwordHash }));
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(409, 'Un compte existe déjà avec cette adresse');
        throw error;
      }
    },

    async login({ email, password }) {
      const user = await repository.findUserCredentialsByEmail(db, email);
      const isValid = await verifyPassword(password, user?.passwordHash ?? (await decoyHash));
      if (!user || !isValid) throw new HttpError(401, INVALID_CREDENTIALS);
      return openSession(user.id);
    },

    async logout(token) {
      const tokenHash = hashSessionToken(token);
      resolved.delete(tokenHash.toString('hex'));
      await repository.deleteSession(db, tokenHash);
    },

    async authenticate(token) {
      const tokenHash = hashSessionToken(token);
      const key = tokenHash.toString('hex');
      const now = clock();
      const known = resolved.get(key);
      if (known && now.getTime() - known.readAt < SESSION_CACHE_MS && known.expiresAt > now) {
        return known.userId;
      }
      const session = await repository.findActiveSession(db, tokenHash, now);
      if (!session) {
        resolved.delete(key);
        return null;
      }
      resolved.set(key, { ...session, readAt: now.getTime() });
      return session.userId;
    },

    async getAccount(userId) {
      const account = await repository.findAccountById(db, userId);
      if (!account) throw new NotFoundError();
      return account;
    },
  };
};
