import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { buildActivationEmail } from './activationEmail.js';
import { buildLoginCodeEmail } from './loginCodeEmail.js';
import { hashPassword, type ScryptParams, verifyPassword } from './password.js';
import * as repository from './repository.js';
import type { Mailer } from './resendClient.js';
import type { Account, Credentials } from './schemas.js';
import {
  digestsEqual,
  generateActivationToken,
  generateChallengeToken,
  generateLoginCode,
  generateSessionToken,
  hashActivationToken,
  hashChallengeToken,
  hashLoginCode,
  hashSessionToken,
} from './token.js';

// EF-AUT-07
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * ENF-PERF-01: every request resolves its cookie, so each one paid a round trip to the hosted database before doing
 * any work of its own. A session already resolved is kept in memory for this long; a logout drops it at once
 * (EF-AUT-04), and its own expiry is kept, so no session lives a second longer than EF-AUT-07 allows.
 */
export const SESSION_CACHE_MS = 60_000;
// ENF-SEC-26: "au plus tard 15 minutes" after the e-mail is sent.
export const ACTIVATION_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
// ENF-SEC-26: "au plus tard 15 minutes"; EF-AUT-16 fixes ten.
export const LOGIN_CODE_LIFETIME_MS = 10 * 60 * 1000;
// ENF-SEC-26: a challenge dies 30 minutes after the password was checked, however many resends extended it, so a
// password holder cannot keep one alive indefinitely.
export const LOGIN_CHALLENGE_MAX_LIFETIME_MS = 30 * 60 * 1000;
// ENF-SEC-26: the fifth consecutive wrong code invalidates it.
export const LOGIN_CODE_MAX_FAILED_ATTEMPTS = 5;

/** Opened session: the raw token goes into the cookie and nowhere else. */
export interface OpenedSession {
  userId: number;
  token: string;
  expiresAt: Date;
}

/** Login waiting for its e-mailed code: the opaque token the browser sends back with it (EF-AUT-16). */
export interface LoginChallenge {
  challenge: string;
}

/** Account just created: inactive, no session opened yet (EF-AUT-01, EF-AUT-14). */
export interface RegisteredAccount {
  id: number;
}

/** Account and session use cases (EF-AUT-01 to 08, EF-AUT-14, EF-AUT-15). */
export interface AuthService {
  /** EF-AUT-01, EF-AUT-14: creates the account inactive and sends its activation e-mail; opens no session. */
  register(credentials: Credentials): Promise<RegisteredAccount>;
  /**
   * EF-AUT-03, EF-AUT-16: checks the credentials and e-mails a six-digit code; opens no session.
   * @throws HttpError 401 (wrong credentials), 403 with `code: 'account_not_activated'` (EF-AUT-14), or 502 when the
   * code could not be sent (the challenge is then deleted).
   */
  login(credentials: Credentials): Promise<LoginChallenge>;
  /**
   * EF-AUT-16: confirms the code and opens the session.
   * @throws HttpError 401 with `code` one of `login_code_invalid`, `login_code_locked`, `login_code_expired` (an
   * unknown challenge answers as an expired one).
   */
  verifyLogin(challenge: string, code: string): Promise<OpenedSession>;
  /**
   * EF-AUT-17: sends a fresh code for a pending login, replacing the previous one and extending its validity by 10
   * minutes, never past 30 minutes after the password was checked. Failed attempts are NOT reset: a challenge allows
   * five wrong codes in total (ENF-SEC-26). Always resolves, whether or not the challenge is known, expired or past
   * its absolute lifetime (nothing sent then, nothing to leak), even when the e-mail fails (logged).
   */
  resendLoginCode(challenge: string): Promise<void>;
  /**
   * EF-AUT-14: activates the account the code belongs to.
   * @throws HttpError 400 with `code` one of `activation_code_expired`, `activation_code_already_used`,
   * `activation_code_invalid`.
   */
  activateAccount(code: string): Promise<void>;
  /**
   * EF-AUT-15: sends a fresh activation e-mail, replacing any still pending one. Always resolves, whether or not
   * the address has an account or a pending activation (never reveals which, RG).
   */
  requestActivationResend(email: string): Promise<void>;
  logout(token: string): Promise<void>;
  authenticate(token: string): Promise<number | null>;
  /** @throws NotFoundError when the account no longer exists. */
  getAccount(userId: number): Promise<Account>;
  /** EF-AUT-13: the account, or `null` when it no longer exists. */
  findAccount(userId: number): Promise<Account | null>;
  /**
   * EF-AUT-11: deletes the account and every datum of it once the password is checked; access granted to other
   * services is revoked first (best effort), and every session of the user stops at once.
   * @throws HttpError 403 when the password is wrong; nothing is deleted then.
   */
  deleteAccount(userId: number, password: string): Promise<void>;
}

interface AuthServiceDeps {
  db: Database;
  clock: Clock;
  passwordParams: ScryptParams;
  /** EF-AUT-14, ENF-RGP-15: sends the activation e-mail (Resend in production, a fake in tests). */
  mailer: Mailer;
  /** Origin of the interface, to compose the activation link (`${frontendOrigin}/activation?code=…`). */
  frontendOrigin: string;
  logger: Logger;
  /** EF-AUT-11: revokes what the user granted elsewhere (Gmail) before the account goes; must not throw. */
  revokeExternalAccess?: (userId: number) => Promise<void>;
  /** ENF-RGP-02, ENF-RGP-06: forgets what is held in memory for the user — results kept 30 minutes — once they are gone. */
  eraseMemoryOf?: (userId: number) => void;
}

const INVALID_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect';
const ACCOUNT_NOT_ACTIVATED_CODE = 'account_not_activated';
const ACCOUNT_NOT_ACTIVATED_MESSAGE =
  'Ce compte n’est pas encore activé : ouvrez le lien reçu par e-mail pour l’activer.';
const REGISTRATION_MAIL_FAILED_MESSAGE =
  'L’e-mail d’activation n’a pas pu être envoyé. Réessayez l’inscription dans quelques instants.';

const LOGIN_MAIL_FAILED_MESSAGE =
  'Le code de connexion n’a pas pu être envoyé. Réessayez dans quelques instants.';
const LOGIN_CODE_FAILURES = {
  invalid: { code: 'login_code_invalid', message: 'Code incorrect. Vérifiez-le et réessayez.' },
  locked: {
    code: 'login_code_locked',
    message:
      'Trop de codes incorrects : ce code n’est plus valable. Reconnectez-vous pour en recevoir un nouveau.',
  },
  expired: {
    code: 'login_code_expired',
    message: 'Ce code a expiré. Reconnectez-vous pour en recevoir un nouveau.',
  },
} as const;

const ACTIVATION_FAILURE_CODE: Record<Exclude<repository.ActivationOutcome, 'activated'>, string> = {
  expired: 'activation_code_expired',
  already_used: 'activation_code_already_used',
  not_found: 'activation_code_invalid',
};
const ACTIVATION_FAILURE_MESSAGE: Record<Exclude<repository.ActivationOutcome, 'activated'>, string> = {
  expired: 'Ce lien d’activation a expiré. Demandez-en un nouveau.',
  already_used: 'Ce lien d’activation a déjà été utilisé.',
  not_found: 'Ce lien d’activation est invalide.',
};

/**
 * EF-AUT-11: checks the password, revokes the external access, deletes the user (every table cascades), then
 * forgets the sessions of the user resolved in the last minute — they would still open without this.
 */
const deleteAccountWith =
  ({
    db,
    resolved,
    revokeExternalAccess,
    eraseMemoryOf,
  }: {
    db: Database;
    resolved: Map<string, { userId: number }>;
    revokeExternalAccess?: (userId: number) => Promise<void>;
    eraseMemoryOf?: (userId: number) => void;
  }) =>
  async (userId: number, password: string): Promise<void> => {
    const passwordHash = await repository.findPasswordHashById(db, userId);
    if (!passwordHash || !(await verifyPassword(password, passwordHash))) {
      throw new HttpError(403, 'Mot de passe incorrect : le compte n’a pas été supprimé.');
    }
    await revokeExternalAccess?.(userId);
    await repository.deleteUser(db, userId);
    eraseMemoryOf?.(userId);
    for (const [key, session] of resolved) if (session.userId === userId) resolved.delete(key);
  };

/**
 * Creates the authentication service.
 * Login answers identically for an unknown email and a wrong password, and spends the same hashing time in both
 * cases (ENF-SEC-19). Passwords and tokens are never logged nor returned.
 * @req EF-AUT-01, EF-AUT-03, EF-AUT-04, EF-AUT-07, EF-AUT-08, EF-AUT-11, EF-AUT-14, EF-AUT-15, EF-AUT-16, EF-AUT-17, ENF-SEC-18,
 * ENF-SEC-19, ENF-SEC-20, ENF-SEC-26, ENF-RGP-15, ENF-PERF-01
 */
export const createAuthService = ({
  db,
  clock,
  passwordParams,
  mailer,
  frontendOrigin,
  logger,
  revokeExternalAccess,
  eraseMemoryOf,
}: AuthServiceDeps): AuthService => {
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

  /** EF-AUT-14, EF-AUT-15: one fresh token, sent to `email`; the caller stores its digest beforehand or after. */
  const newActivationToken = (): { token: string; tokenHash: Buffer; expiresAt: Date } => {
    const token = generateActivationToken();
    return {
      token,
      tokenHash: hashActivationToken(token),
      expiresAt: new Date(clock().getTime() + ACTIVATION_TOKEN_LIFETIME_MS),
    };
  };

  const sendActivationEmail = (email: string, token: string): Promise<void> =>
    mailer.send({ to: email, ...buildActivationEmail({ frontendOrigin, token }) });

  return {
    async register({ email, password }) {
      const passwordHash = await hashPassword(password, passwordParams);
      const activation = newActivationToken();
      let userId: number;
      try {
        userId = await repository.insertUserPendingActivation(db, {
          email,
          passwordHash,
          tokenHash: activation.tokenHash,
          expiresAt: activation.expiresAt,
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new HttpError(409, 'Un compte existe déjà avec cette adresse');
        throw error;
      }
      try {
        await sendActivationEmail(email, activation.token);
      } catch (error) {
        // EF-AUT-14: a candidate must be able to try registering again rather than being stuck with an inactive
        // account whose activation e-mail never arrived — so the half-created account is rolled back.
        logger.error('activation e-mail could not be sent, registration rolled back', { error });
        await repository.deleteUser(db, userId);
        throw new HttpError(502, REGISTRATION_MAIL_FAILED_MESSAGE);
      }
      return { id: userId };
    },

    async login({ email, password }) {
      const user = await repository.findUserCredentialsByEmail(db, email);
      const isValid = await verifyPassword(password, user?.passwordHash ?? (await decoyHash));
      if (!user || !isValid) throw new HttpError(401, INVALID_CREDENTIALS);
      if (!user.activatedAt) {
        throw new HttpError(403, ACCOUNT_NOT_ACTIVATED_MESSAGE, { code: ACCOUNT_NOT_ACTIVATED_CODE });
      }
      // EF-AUT-16: the code is bound to the raw challenge token, which is never stored (ENF-SEC-26).
      const challenge = generateChallengeToken();
      const code = generateLoginCode();
      const tokenHash = hashChallengeToken(challenge);
      await repository.insertLoginChallenge(db, {
        userId: user.id,
        tokenHash,
        codeHash: hashLoginCode(challenge, code),
        expiresAt: new Date(clock().getTime() + LOGIN_CODE_LIFETIME_MS),
        now: clock(),
      });
      try {
        await mailer.send({ to: email, ...buildLoginCodeEmail({ code }) });
      } catch (error) {
        // The log carries the error (already redacted by the client) and never the code (ENF-SEC-08).
        logger.error('login code could not be sent, challenge deleted', { error });
        await repository.deleteLoginChallenge(db, tokenHash);
        throw new HttpError(502, LOGIN_MAIL_FAILED_MESSAGE);
      }
      return { challenge };
    },

    async verifyLogin(challenge, code) {
      const outcome = await repository.checkLoginCode(db, {
        tokenHash: hashChallengeToken(challenge),
        matches: (stored) => digestsEqual(stored, hashLoginCode(challenge, code)),
        now: clock(),
        maxFailedAttempts: LOGIN_CODE_MAX_FAILED_ATTEMPTS,
      });
      if (outcome.status === 'verified') return openSession(outcome.userId);
      const failure = LOGIN_CODE_FAILURES[outcome.status];
      throw new HttpError(401, failure.message, { code: failure.code });
    },

    async resendLoginCode(challenge) {
      const code = generateLoginCode();
      const email = await repository.renewLoginChallenge(db, {
        tokenHash: hashChallengeToken(challenge),
        codeHash: hashLoginCode(challenge, code),
        now: clock(),
        lifetimeMs: LOGIN_CODE_LIFETIME_MS,
        maxLifetimeMs: LOGIN_CHALLENGE_MAX_LIFETIME_MS,
      });
      if (!email) return;
      try {
        await mailer.send({ to: email, ...buildLoginCodeEmail({ code }) });
      } catch (error) {
        logger.warn('login code resend could not be sent', { error });
      }
    },

    async activateAccount(code) {
      const outcome = await repository.consumeActivation(db, {
        tokenHash: hashActivationToken(code),
        now: clock(),
      });
      if (outcome === 'activated') return;
      throw new HttpError(400, ACTIVATION_FAILURE_MESSAGE[outcome], {
        code: ACTIVATION_FAILURE_CODE[outcome],
      });
    },

    async requestActivationResend(email) {
      const user = await repository.findInactiveUserByEmail(db, email);
      if (!user) return;
      const activation = newActivationToken();
      await repository.upsertPendingActivation(db, {
        userId: user.id,
        tokenHash: activation.tokenHash,
        expiresAt: activation.expiresAt,
      });
      try {
        await sendActivationEmail(email, activation.token);
      } catch (error) {
        // EF-AUT-15: the failure must not surface (it would tell an attacker the address has an account); it is
        // still logged, not swallowed, so operations can see Resend is failing.
        logger.warn('activation resend could not be sent', { error });
      }
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

    async findAccount(userId) {
      return repository.findAccountById(db, userId);
    },

    deleteAccount: deleteAccountWith({ db, resolved, revokeExternalAccess, eraseMemoryOf }),
  };
};
