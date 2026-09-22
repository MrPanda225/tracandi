import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { gmailAccounts } from '../../db/schema.js';
import type { SealedSecret } from '../../lib/crypto.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Database or open transaction: repository functions work with both. */
export type Executor = Database | Transaction;

/** The Gmail connection of a user, with its refresh token sealed (ENF-SEC-02). */
export interface GmailAccountRow {
  emailAddress: string;
  refreshToken: SealedSecret;
  historyId: string | null;
  connectedAt: Date;
  lastSyncAt: Date | null;
}

/**
 * The Gmail connection of the user, or null when none (EF-AUT-06: keyed by the user).
 * @req EF-GML-01, EF-CFG-01
 */
export const findGmailAccount = async (db: Executor, userId: number): Promise<GmailAccountRow | null> => {
  const [row] = await db
    .select({
      emailAddress: gmailAccounts.emailAddress,
      ciphertext: gmailAccounts.refreshTokenEnc,
      iv: gmailAccounts.tokenIv,
      tag: gmailAccounts.tokenTag,
      historyId: gmailAccounts.historyId,
      connectedAt: gmailAccounts.connectedAt,
      lastSyncAt: gmailAccounts.lastSyncAt,
    })
    .from(gmailAccounts)
    .where(eq(gmailAccounts.userId, userId));
  if (!row) return null;
  const { ciphertext, iv, tag, ...account } = row;
  return { ...account, refreshToken: { ciphertext, iv, tag } };
};

/**
 * Creates or replaces the Gmail connection of the user. `resetSync` clears the incremental sync position, for a
 * newly connected mailbox (another address than the previous one).
 * @req EF-GML-01, ENF-SEC-02
 */
export const saveGmailAccount = async (
  db: Executor,
  account: {
    userId: number;
    emailAddress: string;
    refreshToken: SealedSecret;
    connectedAt: Date;
    resetSync: boolean;
  },
): Promise<void> => {
  const connection = {
    emailAddress: account.emailAddress,
    refreshTokenEnc: account.refreshToken.ciphertext,
    tokenIv: account.refreshToken.iv,
    tokenTag: account.refreshToken.tag,
    connectedAt: account.connectedAt,
    ...(account.resetSync ? { historyId: null, lastSyncAt: null } : {}),
  };
  await db
    .insert(gmailAccounts)
    .values({ userId: account.userId, ...connection })
    .onConflictDoUpdate({ target: gmailAccounts.userId, set: connection });
};

/**
 * Removes the Gmail connection of the user: no token of that user remains (EF-GML-02).
 * @req EF-GML-02
 */
export const deleteGmailAccount = async (db: Executor, userId: number): Promise<void> => {
  await db.delete(gmailAccounts).where(eq(gmailAccounts.userId, userId));
};
