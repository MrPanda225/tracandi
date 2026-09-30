import { and, count, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { applications, companies, jobOffers, watchedSites } from '../../db/schema.js';
import type { OfferQuery } from './schemas.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Database or open transaction: repository functions work with both. */
export type Executor = Database | Transaction;

type OfferStatus = (typeof jobOffers.status.enumValues)[number];

/** EF-VEI-18: the states each view of the screen lists. */
const STATUSES_OF_VIEW: Record<OfferQuery['view'], readonly OfferStatus[]> = {
  active: ['new', 'saved'],
  saved: ['saved'],
  dismissed: ['dismissed'],
  applied: ['applied'],
};

const offerColumns = {
  id: jobOffers.id,
  title: jobOffers.title,
  // EF-VEI-32: the employer an official source named, or the company of the source.
  companyName: sql<string>`coalesce(${jobOffers.companyName}, ${companies.name}, 'Employeur non précisé')`,
  location: jobOffers.location,
  contractType: jobOffers.contractType,
  url: jobOffers.url,
  postedAt: jobOffers.postedAt,
  firstSeenAt: jobOffers.firstSeenAt,
  relevanceScore: jobOffers.relevanceScore,
  relevanceReason: jobOffers.relevanceReason,
  matchedTarget: jobOffers.matchedTarget,
  status: jobOffers.status,
  adapter: watchedSites.adapter,
  applicationId: applications.id,
};

export interface OfferRow {
  id: number;
  title: string;
  companyName: string;
  location: string | null;
  contractType: (typeof jobOffers.contractType.enumValues)[number];
  url: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  relevanceScore: number | null;
  relevanceReason: string | null;
  matchedTarget: string | null;
  status: OfferStatus;
  adapter: (typeof watchedSites.adapter.enumValues)[number];
  applicationId: number | null;
}

// EF-AUT-06: an offer belongs to the owner of its source.
const ownedBy = (userId: number): SQL => eq(watchedSites.userId, userId);

const filtersOf = (userId: number, query: OfferQuery): SQL | undefined =>
  and(
    ownedBy(userId),
    inArray(jobOffers.status, [...STATUSES_OF_VIEW[query.view]]),
    query.minScore === undefined ? undefined : gte(jobOffers.relevanceScore, query.minScore),
    query.contractType === undefined ? undefined : eq(jobOffers.contractType, query.contractType),
  );

/**
 * EF-VEI-16, EF-VEI-17, EF-VEI-22: one page of the user's offers, best score first — an offer not scored yet
 * last —, the most recently seen first among equal scores, and how many match in all.
 * @req EF-VEI-16, EF-VEI-17, EF-VEI-18, EF-VEI-22, EF-AUT-06
 */
export const listOffers = async (
  db: Executor,
  userId: number,
  query: OfferQuery,
): Promise<{ rows: OfferRow[]; total: number }> => {
  const where = filtersOf(userId, query);
  const [rows, totals] = await Promise.all([
    db
      .select(offerColumns)
      .from(jobOffers)
      .innerJoin(watchedSites, eq(watchedSites.id, jobOffers.siteId))
      .leftJoin(companies, eq(companies.id, watchedSites.companyId))
      .leftJoin(applications, eq(applications.offerId, jobOffers.id))
      .where(where)
      .orderBy(
        sql`${jobOffers.relevanceScore} desc nulls last`,
        desc(jobOffers.firstSeenAt),
        desc(jobOffers.id),
      )
      .limit(query.limit)
      .offset(query.offset),
    // The count needs neither company nor application: joining them would change nothing but the cost.
    db
      .select({ total: count() })
      .from(jobOffers)
      .innerJoin(watchedSites, eq(watchedSites.id, jobOffers.siteId))
      .where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
};

/** One offer of the user with its text, or undefined when it is another user's or does not exist (EF-AUT-06). */
export const findOffer = async (
  db: Executor,
  userId: number,
  id: number,
): Promise<(OfferRow & { description: string | null }) | undefined> =>
  (
    await db
      .select({ ...offerColumns, description: jobOffers.description })
      .from(jobOffers)
      .innerJoin(watchedSites, eq(watchedSites.id, jobOffers.siteId))
      .leftJoin(companies, eq(companies.id, watchedSites.companyId))
      .leftJoin(applications, eq(applications.offerId, jobOffers.id))
      .where(and(ownedBy(userId), eq(jobOffers.id, id)))
  )[0];

/** EF-VEI-18, EF-VEI-19: sets the state of an offer already checked as the user's. */
export const setOfferStatus = async (db: Executor, id: number, status: OfferStatus): Promise<void> => {
  await db.update(jobOffers).set({ status }).where(eq(jobOffers.id, id));
};
