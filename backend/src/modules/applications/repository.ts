import { and, asc, count, desc, eq, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  applicationStatusHistory,
  applications,
  appSettings,
  companies,
  emails,
  platforms,
} from '../../db/schema.js';
import type { ApplicationStatus, EmailCategory } from './rules.js';
import type { ListApplicationsQuery } from './schemas.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Database or open transaction: repository functions work with both. */
export type Executor = Database | Transaction;

/** Application row with its company and platform names. */
export interface ApplicationRow {
  id: number;
  companyId: number;
  companyName: string;
  jobTitle: string;
  jobTitleKey: string;
  contractType: (typeof applications.contractType.enumValues)[number];
  status: ApplicationStatus;
  source: (typeof applications.source.enumValues)[number];
  platformName: string | null;
  notes: string | null;
  appliedAt: Date;
  lastActivityAt: Date;
}

const applicationColumns = {
  id: applications.id,
  companyId: companies.id,
  companyName: companies.name,
  jobTitle: applications.jobTitle,
  jobTitleKey: applications.jobTitleKey,
  contractType: applications.contractType,
  status: applications.status,
  source: applications.source,
  platformName: platforms.name,
  notes: applications.notes,
  appliedAt: applications.appliedAt,
  lastActivityAt: applications.lastActivityAt,
};

// EF-AUT-06: an application belongs to the user owning its company.
const ownedBy = (userId: number) => eq(companies.userId, userId);

const ownedCompanyIds = (db: Executor, userId: number) =>
  db.select({ id: companies.id }).from(companies).where(ownedBy(userId));

const listConditions = (userId: number, query: ListApplicationsQuery, searchKey: string): SQL | undefined =>
  and(
    ownedBy(userId),
    query.status ? eq(applications.status, query.status) : undefined,
    query.contractType ? eq(applications.contractType, query.contractType) : undefined,
    // Q-05: the key contains only [a-z0-9 ], so it cannot inject LIKE wildcards; served by the trigram indexes.
    searchKey
      ? or(ilike(companies.nameKey, `%${searchKey}%`), ilike(applications.jobTitleKey, `%${searchKey}%`))
      : undefined,
  );

/**
 * Lists the user's applications matching the filters, grouped by company in alphabetical order (EF-CAN-01),
 * most recent activity first inside a company, with the total count before pagination.
 * @req EF-CAN-01, EF-CAN-02, EF-CAN-03, EF-CAN-14, EF-AUT-06
 */
export const listApplications = async (
  db: Executor,
  userId: number,
  query: ListApplicationsQuery & { searchKey: string },
): Promise<{ rows: ApplicationRow[]; total: number }> => {
  const where = listConditions(userId, query, query.searchKey);
  const [rows, totals] = await Promise.all([
    db
      .select(applicationColumns)
      .from(applications)
      .innerJoin(companies, eq(applications.companyId, companies.id))
      .leftJoin(platforms, eq(applications.platformId, platforms.id))
      .where(where)
      .orderBy(asc(companies.nameKey), desc(applications.lastActivityAt), asc(applications.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ total: count() })
      .from(applications)
      .innerJoin(companies, eq(applications.companyId, companies.id))
      .where(where),
  ]);
  return { rows, total: totals[0]?.total ?? 0 };
};

/** Returns one application of the user, or null (also when it belongs to another user, EF-AUT-06). */
export const findApplication = async (
  db: Executor,
  userId: number,
  id: number,
): Promise<ApplicationRow | null> => {
  const [row] = await db
    .select(applicationColumns)
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(platforms, eq(applications.platformId, platforms.id))
    .where(and(ownedBy(userId), eq(applications.id, id)));
  return row ?? null;
};

/**
 * One of the user's applications with its offer description (EF-CAN-15), or null when absent or owned by another user.
 * The description is read only here: the list never carries it (up to 20 000 characters per application).
 * @req EF-CAN-15, EF-AUT-06
 */
export const findApplicationDetail = async (
  db: Executor,
  userId: number,
  id: number,
): Promise<(ApplicationRow & { offerDescription: string | null }) | null> => {
  const [row] = await db
    .select({ ...applicationColumns, offerDescription: applications.offerDescription })
    .from(applications)
    .innerJoin(companies, eq(applications.companyId, companies.id))
    .leftJoin(platforms, eq(applications.platformId, platforms.id))
    .where(and(ownedBy(userId), eq(applications.id, id)));
  return row ?? null;
};

/**
 * Returns the id of the user's company with this normalized key, creating it when absent (RG-14 deduplication).
 * @req RG-03, RG-14
 */
export const upsertCompany = async (
  db: Executor,
  company: { userId: number; name: string; nameKey: string },
): Promise<number> => {
  const [row] = await db
    .insert(companies)
    .values(company)
    .onConflictDoUpdate({
      target: [companies.userId, companies.nameKey],
      // No-op update so that RETURNING yields the existing row.
      set: { nameKey: sql`excluded.name_key` },
    })
    .returning({ id: companies.id });
  if (!row) throw new Error('company upsert returned no row');
  return row.id;
};

/**
 * Applications of one company, with what RG-03 needs to choose among them (served by `ix_applications_company_activity`).
 * @req RG-03
 */
export const listCompanyApplications = async (
  db: Executor,
  companyId: number,
): Promise<{ id: number; jobTitleKey: string; lastActivityAt: Date }[]> =>
  db
    .select({
      id: applications.id,
      jobTitleKey: applications.jobTitleKey,
      lastActivityAt: applications.lastActivityAt,
    })
    .from(applications)
    .where(eq(applications.companyId, companyId));

/**
 * Every Gmail thread attached to these applications of the user, with the company and status of its application.
 * @req EF-GML-13, EF-GML-14, EF-AUT-06
 */
export const listApplicationThreads = async (
  db: Executor,
  userId: number,
  applicationIds: readonly number[],
): Promise<{ applicationId: number; companyName: string; status: ApplicationStatus; gmailThreadId: string }[]> =>
  applicationIds.length === 0
    ? []
    : db
        .selectDistinct({
          applicationId: applications.id,
          companyName: companies.name,
          status: applications.status,
          gmailThreadId: emails.gmailThreadId,
        })
        .from(applications)
        .innerJoin(companies, eq(companies.id, applications.companyId))
        .innerJoin(emails, eq(emails.applicationId, applications.id))
        .where(and(ownedBy(userId), inArray(applications.id, [...applicationIds])));

/** Inserts an application and returns its id. @throws unique violation on (company, job title key). */
export const insertApplication = async (
  db: Executor,
  application: typeof applications.$inferInsert,
): Promise<number> => {
  const [row] = await db.insert(applications).values(application).returning({ id: applications.id });
  if (!row) throw new Error('application insert returned no row');
  return row.id;
};

/** Records a status change (Q-06: history behind EF-TDB-02 and EF-TDB-04). */
export const insertStatusChange = async (
  db: Executor,
  change: typeof applicationStatusHistory.$inferInsert,
): Promise<void> => {
  await db.insert(applicationStatusHistory).values(change);
};

/** Updates the given columns of an application already checked as owned by the user. */
export const updateApplication = async (
  db: Executor,
  id: number,
  changes: Partial<typeof applications.$inferInsert>,
): Promise<void> => {
  await db.update(applications).set(changes).where(eq(applications.id, id));
};

/**
 * Deletes one of the user's applications; its messages stay stored, detached (FK `set null`, EF-CAN-09).
 * @returns false when no application of the user has this id.
 * @req EF-CAN-09, EF-AUT-06
 */
export const deleteApplication = async (db: Executor, userId: number, id: number): Promise<boolean> => {
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, id), inArray(applications.companyId, ownedCompanyIds(db, userId))))
    .returning({ id: applications.id });
  return deleted.length > 0;
};

/** Follow-up delay D of the user (RG-06). */
export const getFollowUpDays = async (db: Executor, userId: number): Promise<number | null> => {
  const [settings] = await db
    .select({ followUpDays: appSettings.followUpDays })
    .from(appSettings)
    .where(eq(appSettings.userId, userId));
  return settings?.followUpDays ?? null;
};

/** Message row as shown in a chronology. */
export interface EmailRow {
  id: number;
  gmailThreadId: string;
  direction: (typeof emails.direction.enumValues)[number];
  category: EmailCategory;
  fromAddress: string | null;
  subject: string | null;
  snippet: string | null;
  platformName: string | null;
  receivedAt: Date;
  applicationId: number | null;
}

const emailColumns = {
  id: emails.id,
  gmailThreadId: emails.gmailThreadId,
  direction: emails.direction,
  category: emails.category,
  fromAddress: emails.fromAddress,
  subject: emails.subject,
  snippet: emails.snippet,
  platformName: platforms.name,
  receivedAt: emails.receivedAt,
  applicationId: emails.applicationId,
};

/**
 * Messages of an application in chronological order (EF-CAN-04). The caller has checked ownership.
 * @req EF-CAN-04
 */
export const listEmailsOfApplication = async (db: Executor, applicationId: number): Promise<EmailRow[]> =>
  db
    .select(emailColumns)
    .from(emails)
    .leftJoin(platforms, eq(emails.platformId, platforms.id))
    .where(eq(emails.applicationId, applicationId))
    .orderBy(asc(emails.receivedAt), asc(emails.id));

/** Returns one of the user's messages, or null. */
export const findEmail = async (db: Executor, userId: number, emailId: number): Promise<EmailRow | null> => {
  const [row] = await db
    .select(emailColumns)
    .from(emails)
    .leftJoin(platforms, eq(emails.platformId, platforms.id))
    .where(and(eq(emails.userId, userId), eq(emails.id, emailId)));
  return row ?? null;
};

/** Attaches a message to an application, or detaches it with null (EF-CAN-10). */
export const setEmailApplication = async (
  db: Executor,
  emailId: number,
  applicationId: number | null,
): Promise<void> => {
  await db.update(emails).set({ applicationId }).where(eq(emails.id, emailId));
};
