import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { appSettings, sessions, users } from '../../db/schema.js';

/** Stored user needed to check a password. */
export interface UserCredentials {
  id: number;
  passwordHash: string;
}

/**
 * Creates the user and its default settings in one transaction.
 * @throws the database unique violation when the email already exists (mapped to 409 by the service).
 * @req EF-AUT-01
 */
export const insertUserWithSettings = async (
  db: Database,
  user: { email: string; passwordHash: string },
): Promise<number> =>
  db.transaction(async (tx) => {
    const [created] = await tx.insert(users).values(user).returning({ id: users.id });
    if (!created) throw new Error('user insert returned no row');
    await tx.insert(appSettings).values({ userId: created.id });
    return created.id;
  });

/** Returns the credentials of the user with this (normalized) email, or null. */
export const findUserCredentialsByEmail = async (
  db: Database,
  email: string,
): Promise<UserCredentials | null> => {
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));
  return user ?? null;
};

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

/** Returns the owner of a session that is not expired at `now`, or null (EF-AUT-07). */
export const findActiveSessionUserId = async (
  db: Database,
  tokenHash: Buffer,
  now: Date,
): Promise<number | null> => {
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
  return session?.userId ?? null;
};

/** Deletes a session; no effect when it does not exist (EF-AUT-04). */
export const deleteSession = async (db: Database, tokenHash: Buffer): Promise<void> => {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
};
