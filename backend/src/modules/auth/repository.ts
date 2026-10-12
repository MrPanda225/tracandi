import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { accountActivations, appSettings, sessions, users } from '../../db/schema.js';

/** Stored user needed to check a password and whether the account may open a session yet (EF-AUT-14). */
export interface UserCredentials {
  id: number;
  passwordHash: string;
  activatedAt: Date | null;
}

/**
 * Creates the user — inactive, `activatedAt` null — its default settings and its pending activation row, in one
 * transaction: a candidate is never left with an account and no way to activate it.
 * @throws the database unique violation when the email already exists (mapped to 409 by the service).
 * @req EF-AUT-01, EF-AUT-14
 */
export const insertUserPendingActivation = async (
  db: Database,
  user: { email: string; passwordHash: string; tokenHash: Buffer; expiresAt: Date },
): Promise<number> =>
  db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ email: user.email, passwordHash: user.passwordHash })
      .returning({ id: users.id });
    if (!created) throw new Error('user insert returned no row');
    await tx.insert(appSettings).values({ userId: created.id });
    await tx.insert(accountActivations).values({
      userId: created.id,
      tokenHash: user.tokenHash,
      expiresAt: user.expiresAt,
    });
    return created.id;
  });

/** Returns the credentials of the user with this (normalized) email, or null. */
export const findUserCredentialsByEmail = async (
  db: Database,
  email: string,
): Promise<UserCredentials | null> => {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, activatedAt: users.activatedAt })
    .from(users)
    .where(eq(users.email, email));
  return user ?? null;
};

/**
 * The id of the user with this (normalized) email, only while their account is still inactive, or null — an
 * activated account, or one that never existed, answers identically here (EF-AUT-15: the resend never reveals
 * which).
 */
export const findInactiveUserByEmail = async (
  db: Database,
  email: string,
): Promise<{ id: number } | null> => {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.activatedAt)));
  return user ?? null;
};

/**
 * Replaces the pending activation of a user with a fresh token and expiry (EF-AUT-15: a resend), `upsert`ed on the
 * table's primary key so a candidate never accumulates more than one pending row.
 * @req EF-AUT-15
 */
export const upsertPendingActivation = async (
  db: Database,
  activation: { userId: number; tokenHash: Buffer; expiresAt: Date },
): Promise<void> => {
  await db
    .insert(accountActivations)
    .values(activation)
    .onConflictDoUpdate({
      target: accountActivations.userId,
      set: { tokenHash: activation.tokenHash, expiresAt: activation.expiresAt, consumedAt: null },
    });
};

/** What consuming an activation token found, for the service to turn into the right answer (EF-AUT-14). */
export type ActivationOutcome = 'activated' | 'expired' | 'already_used' | 'not_found';

/**
 * Consumes a single-use activation token: activates its account and marks the row consumed, both at once, unless it
 * is unknown, expired or already consumed. `for('update')` locks the row for the duration of the transaction
 * (database.md: read-then-write under concurrency), so two activations racing on the same token cannot both succeed.
 * @req EF-AUT-14, ENF-SEC-26
 */
export const consumeActivation = async (
  db: Database,
  { tokenHash, now }: { tokenHash: Buffer; now: Date },
): Promise<ActivationOutcome> =>
  db.transaction(async (tx) => {
    const [activation] = await tx
      .select({
        userId: accountActivations.userId,
        expiresAt: accountActivations.expiresAt,
        consumedAt: accountActivations.consumedAt,
      })
      .from(accountActivations)
      .where(eq(accountActivations.tokenHash, tokenHash))
      .for('update');
    if (!activation) return 'not_found';
    if (activation.consumedAt) return 'already_used';
    if (activation.expiresAt <= now) return 'expired';
    await tx
      .update(accountActivations)
      .set({ consumedAt: now })
      .where(eq(accountActivations.userId, activation.userId));
    await tx.update(users).set({ activatedAt: now }).where(eq(users.id, activation.userId));
    return 'activated';
  });

/** Returns the public account of a user, or null. */
export const findAccountById = async (
  db: Database,
  userId: number,
): Promise<{ id: number; email: string } | null> => {
  const [account] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return account ?? null;
};

/** Stores a new session (token digest only, ENF-SEC-20). */
export const insertSession = async (
  db: Database,
  session: { userId: number; tokenHash: Buffer; expiresAt: Date },
): Promise<void> => {
  await db.insert(sessions).values(session);
};

/** An open session: its owner and the instant it expires (EF-AUT-07). */
export interface ActiveSession {
  userId: number;
  expiresAt: Date;
}

/** Returns the owner and the expiry of a session that is not expired at `now`, or null (EF-AUT-07). */
export const findActiveSession = async (
  db: Database,
  tokenHash: Buffer,
  now: Date,
): Promise<ActiveSession | null> => {
  const [session] = await db
    .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  return session ?? null;
};

/** Deletes a session; no effect when it does not exist (EF-AUT-04). */
export const deleteSession = async (db: Database, tokenHash: Buffer): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
};

/** Returns the password hash of a user, or null (EF-AUT-11: the deletion asks for the password again). */
export const findPasswordHashById = async (db: Database, userId: number): Promise<string | null> => {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  return user?.passwordHash ?? null;
};

/**
 * Deletes a user: every table holding their rows cascades from `users`, sessions included (EF-AUT-11, ENF-RGP-02).
 * @req EF-AUT-11
 */
export const deleteUser = async (db: Database, userId: number): Promise<void> => {
  await db.delete(users).where(eq(users.id, userId));
};
