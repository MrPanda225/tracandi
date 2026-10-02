import { and, asc, count, eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { chosenOffers, type experienceLevel } from '../../db/schema.js';

export type ChosenOfferRow = typeof chosenOffers.$inferSelect;
export type ExperienceLevel = (typeof experienceLevel.enumValues)[number];

/** @req EF-VEI-48 */
export const listChosenOffers = async (db: Database, userId: number): Promise<ChosenOfferRow[]> =>
  db.select().from(chosenOffers).where(eq(chosenOffers.userId, userId)).orderBy(asc(chosenOffers.id));

/** @req EF-VEI-50 */
export const listChosenOffersOfLevel = async (
  db: Database,
  userId: number,
  level: ExperienceLevel,
): Promise<ChosenOfferRow[]> =>
  db
    .select()
    .from(chosenOffers)
    .where(and(eq(chosenOffers.userId, userId), eq(chosenOffers.level, level)))
    .orderBy(asc(chosenOffers.id));

/** @req EF-VEI-49 */
export const findChosenOffer = async (
  db: Database,
  userId: number,
  id: number,
): Promise<ChosenOfferRow | null> => {
  const [row] = await db
    .select()
    .from(chosenOffers)
    .where(and(eq(chosenOffers.userId, userId), eq(chosenOffers.id, id)));
  return row ?? null;
};

/** @req EF-VEI-48 */
export const countChosenOffersOfLevel = async (
  db: Database,
  userId: number,
  level: ExperienceLevel,
): Promise<number> => {
  const [row] = await db
    .select({ total: count() })
    .from(chosenOffers)
    .where(and(eq(chosenOffers.userId, userId), eq(chosenOffers.level, level)));
  return row?.total ?? 0;
};

/** The traits of an offer, as kept (ENF-RGP-14). */
export interface Traits {
  title: string;
  keywords: string[];
  years: number | null;
}

/**
 * Keeps an offer whose traits were just extracted. The count of its level is checked again here: the extraction is done
 * in the queue, long after the request that asked for it.
 * @returns the new row, or null when the level already holds `max` offers.
 * @req EF-VEI-48
 */
export const insertChosenOffer = async (
  db: Database,
  {
    userId,
    level,
    traits,
    now,
    max,
  }: { userId: number; level: ExperienceLevel; traits: Traits; now: Date; max: number },
): Promise<ChosenOfferRow | null> =>
  db.transaction(async (tx) => {
    if ((await countChosenOffersOfLevel(tx as unknown as Database, userId, level)) >= max) return null;
    const [row] = await tx
      .insert(chosenOffers)
      .values({ userId, level, ...traits, createdAt: now, updatedAt: now })
      .returning();
    return row ?? null;
  });

/**
 * The corrections of the candidate, and the new level when they move the offer; the room of that level is checked in
 * the same transaction.
 * @returns the offer as saved, or `'full'` when the level it moves to holds `max` already, or null when it is gone.
 * @req EF-VEI-49
 */
export const updateChosenOffer = async (
  db: Database,
  {
    userId,
    id,
    changes,
    now,
    max,
  }: {
    userId: number;
    id: number;
    changes: Partial<Traits> & { level?: ExperienceLevel };
    now: Date;
    max: number;
  },
): Promise<ChosenOfferRow | 'full' | null> =>
  db.transaction(async (tx) => {
    const current = await findChosenOffer(tx as unknown as Database, userId, id);
    if (!current) return null;
    if (changes.level && changes.level !== current.level) {
      if ((await countChosenOffersOfLevel(tx as unknown as Database, userId, changes.level)) >= max)
        return 'full';
    }
    const [row] = await tx
      .update(chosenOffers)
      .set({ ...changes, updatedAt: now })
      .where(and(eq(chosenOffers.userId, userId), eq(chosenOffers.id, id)))
      .returning();
    return row ?? null;
  });

/** @returns false when there was no such offer. @req EF-VEI-48 */
export const deleteChosenOffer = async (db: Database, userId: number, id: number): Promise<boolean> => {
  const deleted = await db
    .delete(chosenOffers)
    .where(and(eq(chosenOffers.userId, userId), eq(chosenOffers.id, id)))
    .returning({ id: chosenOffers.id });
  return deleted.length > 0;
};
