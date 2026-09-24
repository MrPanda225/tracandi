import { and, asc, count, countDistinct, eq, exists, gte, inArray, isNotNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  applicationStatusHistory,
  applications,
  appSettings,
  companies,
  emails,
  jobOffers,
  watchedSites,
} from '../../db/schema.js';
import type { Database } from '../../db/client.js';
import type { ApplicationStatus } from '../applications/rules.js';

type ContractType = (typeof applications.contractType.enumValues)[number];

const REACHED_INTERVIEW: ApplicationStatus[] = ['interview', 'offer'];
const WEEKLY_HISTORY_STATUSES: ApplicationStatus[] = ['interview', 'rejected'];
// RG-06
const FOLLOW_UP_STATUSES: ApplicationStatus[] = ['sent', 'acknowledged'];

// EF-AUT-06: an application belongs to the user owning its company.
const ownedBy = (userId: number) => eq(companies.userId, userId);

// EF-TDB-06: an application without intermediary platform is direct.
const isDirect = sql<boolean>`${applications.platformId} is null`;
// EF-TDB-04: Monday 00:00 UTC of the week (ADR-07).
const appliedWeek = sql<Date>`date_trunc('week', ${applications.appliedAt}, 'UTC')`.mapWith(
  applications.appliedAt,
);
const changedWeek = sql<Date>`date_trunc('week', ${applicationStatusHistory.changedAt}, 'UTC')`.mapWith(
  applicationStatusHistory.changedAt,
);

/** Number of the user's applications for one (status, contract type, channel) combination. */
export interface ApplicationGroupRow {
  status: ApplicationStatus;
  contractType: ContractType;
  isDirect: boolean;
  count: number;
}

/**
 * Counts the user's applications per status, contract type and channel in one scan; every dashboard total
 * (EF-TDB-01, 03, 05, 06, 09) is derived from these rows.
 * @req EF-TDB-01, EF-TDB-03, EF-TDB-05, EF-TDB-06, EF-TDB-09, EF-AUT-06
 */
export const countApplicationGroups = (db: Database, userId: number): Promise<ApplicationGroupRow[]> =>
  db
    .select({
      status: applications.status,
      contractType: applications.contractType,
      isDirect,
      count: count(),
    })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(ownedBy(userId))
    .groupBy(applications.status, applications.contractType, isDirect);

/**
 * Number of the user's applications that are, or have been, at Entretien or Proposition (Q-06 status history).
 * @req EF-TDB-02
 */
export const countReachedInterview = async (db: Database, userId: number): Promise<number> => {
  const reachedInHistory = db
    .select({ id: applicationStatusHistory.id })
    .from(applicationStatusHistory)
    .where(
      and(
        eq(applicationStatusHistory.applicationId, applications.id),
        inArray(applicationStatusHistory.status, REACHED_INTERVIEW),
      ),
    );
  const [row] = await db
    .select({ count: count() })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(
      and(ownedBy(userId), or(inArray(applications.status, REACHED_INTERVIEW), exists(reachedInHistory))),
    );
  return row?.count ?? 0;
};

/** Count for one week, and for one status when the rows come from the status history. */
export interface WeeklyRow {
  weekStart: Date;
  count: number;
}

/**
 * Applications sent per week since `since` (application date; « À postuler » excluded, not sent yet).
 * @req EF-TDB-04
 */
export const countSentPerWeek = (db: Database, userId: number, since: Date): Promise<WeeklyRow[]> =>
  db
    .select({ weekStart: appliedWeek, count: count() })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(and(ownedBy(userId), gte(applications.appliedAt, since), ne(applications.status, 'to_apply')))
    .groupBy(appliedWeek);

/**
 * Applications that reached Entretien or Refusée per week since `since`, from the status history.
 * @req EF-TDB-04
 */
export const countStatusChangesPerWeek = (
  db: Database,
  userId: number,
  since: Date,
): Promise<(WeeklyRow & { status: ApplicationStatus })[]> =>
  db
    .select({
      weekStart: changedWeek,
      status: applicationStatusHistory.status,
      count: countDistinct(applicationStatusHistory.applicationId),
    })
    .from(applicationStatusHistory)
    .innerJoin(applications, eq(applicationStatusHistory.applicationId, applications.id))
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .where(
      and(
        ownedBy(userId),
        gte(applicationStatusHistory.changedAt, since),
        inArray(applicationStatusHistory.status, WEEKLY_HISTORY_STATUSES),
      ),
    )
    .groupBy(changedWeek, applicationStatusHistory.status);

/** Application to follow up, as listed by the dashboard. */
export interface FollowUpRow {
  id: number;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  lastActivityAt: Date;
}

const followUpConditions = (db: Database, userId: number, inactiveSince: Date) =>
  and(
    ownedBy(userId),
    inArray(applications.status, FOLLOW_UP_STATUSES),
    lt(applications.lastActivityAt, inactiveSince),
    // RG-06 (v1.22): only an application someone can be written to (RG-20).
    exists(
      db
        .select({ id: emails.id })
        .from(emails)
        .where(and(eq(emails.applicationId, applications.id), isNotNull(emails.contactAddress))),
    ),
  );

/**
 * RG-06: the user's applications at Envoyée or Accusé reçu with no activity since `inactiveSince` and a contact
 * address (v1.22), oldest activity first (at most `limit`), and their total number.
 * @req EF-TDB-07, RG-06
 */
export const listFollowUps = async (
  db: Database,
  userId: number,
  { inactiveSince, limit }: { inactiveSince: Date; limit: number },
): Promise<{ rows: FollowUpRow[]; total: number }> => {
  const where = followUpConditions(db, userId, inactiveSince);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: applications.id,
        company: companies.name,
        jobTitle: applications.jobTitle,
        status: applications.status,
        lastActivityAt: applications.lastActivityAt,
      })
      .from(applications)
      .innerJoin(companies, eq(applications.companyId, companies.id))
      .where(where)
      .orderBy(asc(applications.lastActivityAt), asc(applications.id))
      .limit(limit),
    db
      .select({ total: count() })
      .from(applications)
      .innerJoin(companies, eq(applications.companyId, companies.id))
      .where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
};

/**
 * Number of the user's offers at « nouvelle » with a relevance score of at least `threshold`.
 * @req EF-TDB-08
 */
export const countNewOffersAbove = async (
  db: Database,
  userId: number,
  threshold: number,
): Promise<number> => {
  const [row] = await db
    .select({ count: count() })
    .from(jobOffers)
    .innerJoin(watchedSites, eq(jobOffers.siteId, watchedSites.id))
    .innerJoin(companies, eq(watchedSites.companyId, companies.id))
    .where(and(ownedBy(userId), eq(jobOffers.status, 'new'), gte(jobOffers.relevanceScore, threshold)));
  return row?.count ?? 0;
};

/** Follow-up delay D (RG-06) and offer threshold S of the user, or null without settings row. */
export const getDashboardSettings = async (
  db: Database,
  userId: number,
): Promise<{ followUpDays: number; offerAlertThreshold: number } | null> => {
  const [row] = await db
    .select({ followUpDays: appSettings.followUpDays, offerAlertThreshold: appSettings.offerAlertThreshold })
    .from(appSettings)
    .where(eq(appSettings.userId, userId));
  return row ?? null;
};
