import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { candidateProfiles } from '../../db/schema.js';

/**
 * The reference profile of a user as it is stored, or null when none was ever saved. The document is `unknown`:
 * only the service, through its schema, turns it into a profile (clean-code.md).
 * @req EF-CVX-01, Q-16
 */
export const findProfileDocument = async (db: Database, userId: number): Promise<unknown | null> => {
  const [row] = await db
    .select({ document: candidateProfiles.document })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.userId, userId));
  return row?.document ?? null;
};

/**
 * Replaces the reference profile of a user, or writes the first one.
 * @req EF-CVX-02, Q-16
 */
export const saveProfileDocument = async (
  db: Database,
  { userId, document, updatedAt }: { userId: number; document: unknown; updatedAt: Date },
): Promise<void> => {
  await db
    .insert(candidateProfiles)
    .values({ userId, document, updatedAt })
    .onConflictDoUpdate({ target: candidateProfiles.userId, set: { document, updatedAt } });
};
