import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../../lib/clock.js';

/** ENF-SEC-14: a state is accepted during 10 minutes after it was issued, once. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const STATE_BYTES = 24;

interface PendingState {
  digest: Buffer;
  userId: number;
  expiresAt: number;
}

/** States issued for Google's authorization, each tied to the user who asked for it. */
export interface OAuthStateStore {
  /** A new unguessable state (24 random bytes, base64url) for this user. */
  issue: (userId: number) => string;
  /**
   * The user of a state issued less than 10 minutes ago, consumed so that it can never be replayed.
   * @returns null for an absent, unknown, already used or expired state.
   */
  consume: (state: string | undefined) => number | null;
}

const digestOf = (state: string): Buffer => createHash('sha256').update(state).digest();

/**
 * In-memory store of the OAuth states. Google's return reaches the API without the session cookie (another host,
 * SameSite=Strict): the state is what ties the answer to the user. One process serves the application, so memory is
 * enough; a restart only asks the user to click again.
 * @req ENF-SEC-14
 */
export const createOAuthStateStore = ({ clock }: { clock: Clock }): OAuthStateStore => {
  // Keyed by the digest of the state: the lookup never compares the secret itself.
  const pending = new Map<string, PendingState>();

  const forgetExpired = (now: number) => {
    for (const [key, entry] of pending) if (entry.expiresAt <= now) pending.delete(key);
  };

  return {
    issue(userId) {
      const now = clock().getTime();
      forgetExpired(now);
      const state = randomBytes(STATE_BYTES).toString('base64url');
      const digest = digestOf(state);
      pending.set(digest.toString('hex'), { digest, userId, expiresAt: now + OAUTH_STATE_TTL_MS });
      return state;
    },

    consume(state) {
      if (!state) return null;
      const digest = digestOf(state);
      const key = digest.toString('hex');
      const entry = pending.get(key);
      pending.delete(key);
      if (!entry || !timingSafeEqual(entry.digest, digest)) return null;
      return entry.expiresAt > clock().getTime() ? entry.userId : null;
    },
  };
};
