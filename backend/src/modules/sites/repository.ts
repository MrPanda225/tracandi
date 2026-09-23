import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { companies, jobOffers, watchedSites } from '../../db/schema.js';
import type { NormalizedOffer, SiteAdapterId } from '../../scraper/adapters/types.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Database or open transaction: repository functions work with both. */
export type Executor = Database | Transaction;

/** A watched source with the name of its company and how many offers it has produced. */
export interface SourceRow {
  id: number;
  companyId: number;
  companyName: string;
  adapter: SiteAdapterId;
  identifier: string;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastError: string | null;
  offerCount: number;
}

// EF-AUT-06: a source belongs to the user owning its company.
const ownedBy = (userId: number) => eq(companies.userId, userId);

/**
 * ENF-PERF-04: counted by a correlated subquery rather than a join, which the planner serves from
 * `uq_job_offers_source_item` (site_id first) one source at a time. Joining and grouping made it read the whole
 * of `job_offers` for a list of a dozen sources.
 */
const offerCount = sql<number>`(
  select count(*)::int from ${jobOffers} where ${jobOffers.siteId} = ${watchedSites.id}
)`;

const sourceColumns = {
  id: watchedSites.id,
  companyId: watchedSites.companyId,
  companyName: companies.name,
  adapter: watchedSites.adapter,
  identifier: watchedSites.identifier,
  isActive: watchedSites.isActive,
  lastCheckedAt: watchedSites.lastCheckedAt,
  lastError: watchedSites.lastError,
  offerCount,
};

const selectSources = (db: Executor) =>
  db
    .select(sourceColumns)
    .from(watchedSites)
    .innerJoin(companies, eq(companies.id, watchedSites.companyId));

/**
 * The user's watched sources, company first then identifier, with their offer count.
 * @req EF-VEI-01, EF-AUT-06
 */
export const listSources = async (db: Executor, userId: number): Promise<SourceRow[]> =>
  selectSources(db).where(ownedBy(userId)).orderBy(companies.name, watchedSites.identifier);

/** One source of the user, or undefined when it is another user's or does not exist (EF-AUT-06). */
export const findSource = async (db: Executor, userId: number, id: number): Promise<SourceRow | undefined> =>
  (await selectSources(db).where(and(ownedBy(userId), eq(watchedSites.id, id))))[0];

/** The active sources of the user, as one pass of the watch reads them (EF-VEI-04, EF-VEI-07). */
export const listActiveSources = async (db: Executor, userId: number): Promise<SourceRow[]> =>
  selectSources(db)
    .where(and(ownedBy(userId), eq(watchedSites.isActive, true)))
    .orderBy(watchedSites.id);

/** Every user whose watch has at least one active source, for the scheduled pass (EF-VEI-06). */
export const listUsersWithActiveSources = async (db: Executor): Promise<number[]> => {
  const rows = await db
    .selectDistinct({ userId: companies.userId })
    .from(watchedSites)
    .innerJoin(companies, eq(companies.id, watchedSites.companyId))
    .where(eq(watchedSites.isActive, true));
  return rows.map((row) => row.userId);
};

/**
 * Adds a source.
 * @throws the unique violation of `uq_watched_sites_source` when it is already watched (EF-VEI-03).
 * @req EF-VEI-01, EF-VEI-03
 */
export const insertSource = async (
  db: Executor,
  source: { companyId: number; adapter: SiteAdapterId; identifier: string },
): Promise<number> => {
  const [row] = await db.insert(watchedSites).values(source).returning({ id: watchedSites.id });
  if (!row) throw new Error('watched site insert returned no row');
  return row.id;
};

/** EF-VEI-04: suspends or reactivates a source of the user. */
export const setSourceActive = async (
  db: Executor,
  change: { userId: number; id: number; isActive: boolean },
): Promise<void> => {
  await db
    .update(watchedSites)
    .set({ isActive: change.isActive })
    .where(
      and(
        eq(watchedSites.id, change.id),
        inArray(watchedSites.companyId, ownedCompanyIds(db, change.userId)),
      ),
    );
};

const ownedCompanyIds = (db: Executor, userId: number) =>
  db.select({ id: companies.id }).from(companies).where(ownedBy(userId));

/** EF-VEI-05: removes a source of the user; its offers go with it (`on delete cascade`). */
export const deleteSource = async (db: Executor, userId: number, id: number): Promise<void> => {
  await db
    .delete(watchedSites)
    .where(and(eq(watchedSites.id, id), inArray(watchedSites.companyId, ownedCompanyIds(db, userId))));
};

/** EF-VEI-10, EF-VEI-11: what the last check of a source left behind, kept whether it worked or not. */
export const recordCheck = async (
  db: Executor,
  id: number,
  outcome: { checkedAt: Date; error: string | null },
): Promise<void> => {
  await db
    .update(watchedSites)
    .set({ lastCheckedAt: outcome.checkedAt, lastError: outcome.error })
    .where(eq(watchedSites.id, id));
};

/** The identifiers a source has already produced, to leave its known offers alone (EF-VEI-09). */
export const listKnownOfferIds = async (db: Executor, siteId: number): Promise<Set<string>> => {
  const rows = await db
    .select({ externalId: jobOffers.externalId })
    .from(jobOffers)
    .where(eq(jobOffers.siteId, siteId));
  return new Set(rows.map((row) => row.externalId));
};

/** An offer about to be stored: what the adapter read, plus what the scoring decided. */
export interface OfferToStore extends NormalizedOffer {
  relevanceScore: number;
  relevanceReason: string | null;
  matchedTarget: string | null;
}

/**
 * Stores the offers a source produced and this user does not have yet. A concurrent pass that stored the same
 * offer first is not an error: the row is left as it is (`uq_job_offers_source_item`).
 * @returns how many rows were actually added.
 * @req EF-VEI-09, EF-VEI-12, EF-VEI-21
 */
export const insertOffers = async (
  db: Executor,
  siteId: number,
  offers: readonly OfferToStore[],
): Promise<number> => {
  if (offers.length === 0) return 0;
  const rows = await db
    .insert(jobOffers)
    .values(
      offers.map((offer) => ({
        siteId,
        externalId: offer.externalId,
        title: offer.title,
        location: offer.location,
        contractType: offer.contractType,
        url: offer.url,
        description: offer.description,
        postedAt: offer.postedAt,
        relevanceScore: offer.relevanceScore,
        relevanceReason: offer.relevanceReason,
        matchedTarget: offer.matchedTarget,
      })),
    )
    .onConflictDoNothing({ target: [jobOffers.siteId, jobOffers.externalId] })
    .returning({ id: jobOffers.id });
  return rows.length;
};
