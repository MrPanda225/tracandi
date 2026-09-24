import type pg from 'pg';
import type { Database } from '../../src/db/client.js';
import {
  applications,
  applicationStatus,
  applicationStatusHistory,
  appSettings,
  companies,
  contractType,
  emailCategory,
  emails,
  jobOffers,
  offerStatus,
  processedMessages,
  users,
  watchedSites,
} from '../../src/db/schema.js';

// ENF-PERF-01 load, all owned by the single user of the application.
const LOAD = { companies: 200, applications: 1_000, messages: 10_000, sites: 20, offers: 5_000 };
const INSERT_CHUNK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const chunksOf = <T>(rows: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(rows.length / INSERT_CHUNK) }, (_, index) =>
    rows.slice(index * INSERT_CHUNK, (index + 1) * INSERT_CHUNK),
  );

const pick = <T>(values: readonly T[], index: number): T => values[index % values.length] as T;

/**
 * Fills an empty database with the ENF-PERF-01 volume (1 000 applications with their status history, 10 000
 * messages, 5 000 offers) for one fictitious user, then refreshes the planner statistics. Returns the id of that user.
 */
export const seedLoadDataset = async (db: Database, pool: pg.Pool, now: Date): Promise<number> => {
  const daysBefore = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const [user] = await db
    .insert(users)
    .values({ email: 'charge@example.com', passwordHash: 'not-a-real-hash' })
    .returning({ id: users.id });
  if (!user) throw new Error('load user not created');
  await db.insert(appSettings).values({ userId: user.id });

  const companyIds = (
    await db
      .insert(companies)
      .values(
        Array.from({ length: LOAD.companies }, (_, i) => ({
          userId: user.id,
          name: `Entreprise ${i}`,
          nameKey: `entreprise ${i}`,
        })),
      )
      .returning({ id: companies.id })
  ).map((row) => row.id);

  const applicationIds: number[] = [];
  const applicationRows = Array.from({ length: LOAD.applications }, (_, i) => ({
    companyId: pick(companyIds, i),
    jobTitle: `Poste ${i}`,
    jobTitleKey: `poste ${i}`,
    contractType: pick(contractType.enumValues, i),
    status: pick(applicationStatus.enumValues, i),
    source: 'manual' as const,
    appliedAt: daysBefore(i % 700),
    lastActivityAt: daysBefore(i % 60),
  }));
  for (const chunk of chunksOf(applicationRows)) {
    const inserted = await db.insert(applications).values(chunk).returning({ id: applications.id });
    applicationIds.push(...inserted.map((row) => row.id));
  }

  // Every application was sent; one in three later reached Entretien or Refusée.
  const historyRows = applicationIds.flatMap((applicationId, i) => [
    { applicationId, status: 'sent' as const, changedAt: daysBefore(i % 700), origin: 'manual' as const },
    ...(i % 3 === 0
      ? [
          {
            applicationId,
            status: i % 2 ? ('interview' as const) : ('rejected' as const),
            changedAt: daysBefore(i % 90),
            origin: 'email' as const,
          },
        ]
      : []),
  ]);
  for (const chunk of chunksOf(historyRows)) await db.insert(applicationStatusHistory).values(chunk);

  // Ten messages per application, every category represented, one in ten sent by the candidate.
  const messageRows = Array.from({ length: LOAD.messages }, (_, i) => ({
    userId: user.id,
    gmailMessageId: `msg-${String(i).padStart(6, '0')}`,
    gmailThreadId: `thread-${String(Math.floor(i / 2)).padStart(6, '0')}`,
    applicationId: pick(applicationIds, i),
    direction: i % 10 === 0 ? ('outbound' as const) : ('inbound' as const),
    fromAddress: `rh@entreprise-${i % LOAD.companies}.example`,
    subject: `Votre candidature ${i}`,
    snippet: 'Bonjour, nous avons bien reçu votre candidature.',
    // RG-20: most messages carry a contact; the ones from a no-reply address do not.
    contactAddress: i % 3 === 0 ? null : `rh@entreprise-${i % LOAD.companies}.example`,
    category: pick(emailCategory.enumValues, i),
    receivedAt: daysBefore(i % 365),
  }));
  for (const chunk of chunksOf(messageRows)) {
    await db.insert(processedMessages).values(
      chunk.map((row) => ({ userId: row.userId, gmailMessageId: row.gmailMessageId, outcome: 'retained' as const })),
    );
    await db.insert(emails).values(chunk);
  }

  const siteIds = (
    await db
      .insert(watchedSites)
      .values(
        Array.from({ length: LOAD.sites }, (_, i) => ({
          companyId: pick(companyIds, i),
          adapter: 'greenhouse' as const,
          identifier: `site-${i}`,
        })),
      )
      .returning({ id: watchedSites.id })
  ).map((row) => row.id);
  const offerRows = Array.from({ length: LOAD.offers }, (_, i) => ({
    siteId: pick(siteIds, i),
    externalId: `offre-${i}`,
    title: `Offre ${i}`,
    url: `https://emplois.example.com/offres/${i}`,
    relevanceScore: i % 101,
    status: pick(offerStatus.enumValues, i),
  }));
  for (const chunk of chunksOf(offerRows)) await db.insert(jobOffers).values(chunk);

  // Fresh statistics and visibility map, as autovacuum leaves them on a database in use.
  await pool.query('VACUUM ANALYZE');
  return user.id;
};
