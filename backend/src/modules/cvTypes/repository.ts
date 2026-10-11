import { and, asc, count, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { cvTypes } from '../../db/schema.js';

/** A CV type as stored: its label, the years and level worked out from it (ENF-RGP-14). */
export type CvTypeRow = typeof cvTypes.$inferSelect;

/** What is worked out from a CV type and kept with it: the years, and the level they give (ENF-RGP-14). */
export interface CvTypeProfile {
  years: number;
  level: NonNullable<CvTypeRow['level']>;
}

/** @req EF-CVX-39 */
export const listCvTypes = async (db: Database, userId: number): Promise<CvTypeRow[]> =>
  db.select().from(cvTypes).where(eq(cvTypes.userId, userId)).orderBy(asc(cvTypes.id));

/** @req EF-CVX-41, EF-CVX-42 */
export const findCvType = async (db: Database, userId: number, id: number): Promise<CvTypeRow | null> => {
  const [row] = await db
    .select()
    .from(cvTypes)
    .where(and(eq(cvTypes.userId, userId), eq(cvTypes.id, id)));
  return row ?? null;
};

/** @req EF-CVX-39 */
export const countCvTypes = async (db: Database, userId: number): Promise<number> => {
  const [row] = await db.select({ total: count() }).from(cvTypes).where(eq(cvTypes.userId, userId));
  return row?.total ?? 0;
};

/**
 * Keeps a CV type that was just read. The count is checked again here: the reading is done in the queue, long after
 * the request that asked for it.
 * @returns the new row, or null when the candidate already holds `max` CV types.
 * @req EF-CVX-39
 */
export const insertCvType = async (
  db: Database,
  {
    userId,
    label,
    profile,
    now,
    max,
  }: { userId: number; label: string; profile: CvTypeProfile; now: Date; max: number },
): Promise<CvTypeRow | null> =>
  db.transaction(async (tx) => {
    if ((await countCvTypes(tx as unknown as Database, userId)) >= max) return null;
    const [row] = await tx
      .insert(cvTypes)
      .values({ userId, label, years: profile.years, level: profile.level, createdAt: now, updatedAt: now })
      .returning();
    return row ?? null;
  });

/**
 * A CV type read again from another file: what was worked out from the old one gives way to the new (EF-CVX-41).
 * @returns false when the CV type is gone.
 */
export const updateCvTypeProfile = async (
  db: Database,
  { userId, id, profile, now }: { userId: number; id: number; profile: CvTypeProfile; now: Date },
): Promise<boolean> => {
  const updated = await db
    .update(cvTypes)
    .set({ years: profile.years, level: profile.level, updatedAt: now })
    .where(and(eq(cvTypes.userId, userId), eq(cvTypes.id, id)))
    .returning({ id: cvTypes.id });
  return updated.length > 0;
};

/** @returns false when there was no such CV type. @req EF-CVX-42 */
export const deleteCvType = async (db: Database, userId: number, id: number): Promise<boolean> => {
  const deleted = await db
    .delete(cvTypes)
    .where(and(eq(cvTypes.userId, userId), eq(cvTypes.id, id)))
    .returning({ id: cvTypes.id });
  return deleted.length > 0;
};
