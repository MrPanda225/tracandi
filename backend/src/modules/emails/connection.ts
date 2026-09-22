import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { decryptSecret, encryptSecret } from '../../lib/crypto.js';
import type { Logger } from '../../lib/logger.js';
import { GmailAccessRefusedError, type GoogleOAuth } from './googleOAuth.js';
import type { OAuthStateStore } from './oauthState.js';
import * as repository from './repository.js';

/** Result of Google's redirection, shown to the user on the settings screen. */
export type AuthorizationOutcome = 'connected' | 'refused' | 'expired' | 'failed';

/** What the settings screen shows of the Gmail connection (EF-CFG-01). */
export type GmailStatus =
  | { connected: false }
  | {
      connected: true;
      emailAddress: string;
      connectedAt: Date;
      lastSyncAt: Date | null;
      applyLabels: boolean;
      /** Q-11: Google refused the authorisation; the user must connect Gmail again. */
      authorizationExpired: boolean;
    };

/** Google's redirection parameters, as received (none is trusted). */
export interface AuthorizationAnswer {
  code?: string;
  state?: string;
  error?: string;
}

export interface GmailConnectionService {
  /** Google's consent page for this user, with a fresh single-use state (EF-GML-01, ENF-SEC-14). */
  authorizationUrl: (userId: number) => string;
  /**
   * Completes the connection from Google's redirection. Never throws: every failure becomes an outcome.
   * The state is checked first, before any use of the code (ENF-SEC-14).
   */
  completeAuthorization: (answer: AuthorizationAnswer) => Promise<AuthorizationOutcome>;
  status: (userId: number) => Promise<GmailStatus>;
  /** Revokes the token at Google when reachable, then removes it: none remains in the database (EF-GML-02). */
  disconnect: (userId: number) => Promise<void>;
  /** EF-GML-17: turns the writing of labels in Gmail on or off. */
  setApplyLabels: (userId: number, applyLabels: boolean) => Promise<void>;
}

interface GmailConnectionDeps {
  db: Database;
  google: GoogleOAuth;
  states: OAuthStateStore;
  encryptionKey: Buffer;
  clock: Clock;
  logger: Logger;
}

/** EF-CFG-01, EF-GML-17: what the settings screen shows of the connection of the user. */
const statusOf = async (db: Database, userId: number): Promise<GmailStatus> => {
  const [account, applyLabels] = await Promise.all([
    repository.findGmailAccount(db, userId),
    repository.findApplyLabels(db, userId),
  ]);
  if (!account) return { connected: false };
  return {
    connected: true,
    emailAddress: account.emailAddress,
    connectedAt: account.connectedAt,
    lastSyncAt: account.lastSyncAt,
    // The settings row exists from the registration; labels are on by default (app_settings).
    applyLabels: applyLabels ?? true,
    authorizationExpired: account.authorizationExpiredAt !== null,
  };
};

/**
 * Creates the Gmail connection service: OAuth authorization with the gmail.modify scope, refresh token encrypted with
 * AES-256-GCM, one connection per user.
 * @req EF-GML-01, EF-GML-02, EF-GML-17, EF-CFG-01, ENF-SEC-02, ENF-SEC-07, ENF-SEC-14
 */
export const createGmailConnectionService = ({
  db,
  google,
  states,
  encryptionKey,
  clock,
  logger,
}: GmailConnectionDeps): GmailConnectionService => {
  const exchange = async (userId: number, code: string): Promise<AuthorizationOutcome> => {
    try {
      const { refreshToken, emailAddress } = await google.exchangeCode(code);
      const previous = await repository.findGmailAccount(db, userId);
      await repository.saveGmailAccount(db, {
        userId,
        emailAddress,
        refreshToken: encryptSecret(refreshToken, encryptionKey),
        connectedAt: clock(),
        resetSync: previous?.emailAddress !== emailAddress,
      });
      return 'connected';
    } catch (error) {
      if (error instanceof GmailAccessRefusedError) return 'refused';
      logger.error('gmail authorization failed', { error });
      return 'failed';
    }
  };

  return {
    authorizationUrl: (userId) => google.authorizationUrl(states.issue(userId)),

    async completeAuthorization({ code, state, error }) {
      const userId = states.consume(state);
      if (userId === null) return 'expired';
      if (error) return 'refused';
      if (!code) return 'failed';
      return exchange(userId, code);
    },

    status: (userId) => statusOf(db, userId),

    setApplyLabels: (userId, applyLabels) => repository.setApplyLabels(db, userId, applyLabels),

    async disconnect(userId) {
      const account = await repository.findGmailAccount(db, userId);
      if (!account) return;
      try {
        await google.revoke(decryptSecret(account.refreshToken, encryptionKey));
      } catch (error) {
        // EF-GML-02 is about the database: the local token goes even if Google cannot be told.
        logger.warn('gmail token revocation failed, token removed locally', { error });
      }
      await repository.deleteGmailAccount(db, userId);
    },
  };
};
