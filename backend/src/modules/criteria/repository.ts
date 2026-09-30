import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { watchCriteria } from '../../db/schema.js';

/**
 * The search criteria of a user as stored, or null when none were ever saved. The document is `unknown`: only the
 * service, through its schema, turns it into criteria (clean-code.md).
 * @req EF-VEI-29
 */
export const findCriteriaDocument = async (db: Database, userId: number): Promise<unknown | null> => {
  const [row] = await db
    .select({ document: watchCriteria.document })
    .from(watchCriteria)
    .where(eq(watchCriteria.userId, userId));
  return row?.document ?? null;
};

/**
 * Replaces the search criteria of a user, or writes the first ones.
 * @req EF-VEI-29
 */
export const saveCriteriaDocument = async (
  db: Database,
  { userId, document, updatedAt }: { userId: number; document: unknown; updatedAt: Date },
): Promise<void> => {
  await db
    .insert(watchCriteria)
    .values({ userId, document, updatedAt })
    .onConflictDoUpdate({ target: watchCriteria.userId, set: { document, updatedAt } });
};
