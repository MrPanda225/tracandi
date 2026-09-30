import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  applications,
  appSettings,
  companies,
  emails,
  gmailAccounts,
  gmailLabels,
  jobRuns,
  type messageOutcome,
  platformDomains,
  platforms,
  prefilterKeywords,
  processedMessages,
} from '../../db/schema.js';
import type { SealedSecret } from '../../lib/crypto.js';

// PostgreSQL takes at most 65 535 parameters per statement: ids go by slices well below it.
const IDS_PER_STATEMENT = 1000;

const slices = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / IDS_PER_STATEMENT) }, (_, index) =>
    items.slice(index * IDS_PER_STATEMENT, (index + 1) * IDS_PER_STATEMENT),
  );

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
  /** Q-11: when Google refused the refresh token; null while the authorisation holds. */
  authorizationExpiredAt: Date | null;
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
      authorizationExpiredAt: gmailAccounts.authorizationExpiredAt,
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
    // Q-11: a new authorisation replaces an expired one.
    authorizationExpiredAt: null,
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

/** What a synchronisation starts from: the sealed token, the last synchronisation, N (EF-GML-05), labels (EF-GML-17). */
export interface SyncSource {
  refreshToken: SealedSecret;
  lastSyncAt: Date | null;
  lookbackDays: number;
  shouldApplyLabels: boolean;
}

/**
 * The Gmail connection of the user with its synchronisation settings, or null when no mailbox is connected.
 * @req EF-GML-05, EF-GML-17
 */
export const findSyncSource = async (db: Executor, userId: number): Promise<SyncSource | null> => {
  const [row] = await db
    .select({
      ciphertext: gmailAccounts.refreshTokenEnc,
      iv: gmailAccounts.tokenIv,
      tag: gmailAccounts.tokenTag,
      lastSyncAt: gmailAccounts.lastSyncAt,
      lookbackDays: appSettings.gmailLookbackDays,
      shouldApplyLabels: appSettings.gmailApplyLabels,
    })
    .from(gmailAccounts)
    .innerJoin(appSettings, eq(appSettings.userId, gmailAccounts.userId))
    .where(eq(gmailAccounts.userId, userId));
  if (!row) return null;
  const { ciphertext, iv, tag, ...source } = row;
  return { ...source, refreshToken: { ciphertext, iv, tag } };
};

/**
 * Job keywords of the user (RG-10), in no particular order; empty when none was ever given.
 * @req RG-10
 */
export const findPrefilterKeywords = async (db: Executor, userId: number): Promise<string[]> => {
  const rows = await db
    .select({ keyword: prefilterKeywords.keyword })
    .from(prefilterKeywords)
    .where(eq(prefilterKeywords.userId, userId));
  return rows.map((row) => row.keyword);
};

/**
 * Adds job keywords to the list of the user; a keyword already listed is kept once.
 * @req RG-10, Q-09
 */
export const insertPrefilterKeywords = async (
  db: Executor,
  userId: number,
  keywords: readonly string[],
): Promise<void> => {
  if (keywords.length === 0) return;
  await db
    .insert(prefilterKeywords)
    .values(keywords.map((keyword) => ({ userId, keyword })))
    .onConflictDoNothing();
};

/**
 * Records the known platforms and their sender domains; platforms and domains already there are left as they are.
 * @req RG-10, EF-GML-10
 */
export const saveKnownPlatforms = async (
  db: Database,
  known: readonly { name: string; nameKey: string; domains: readonly string[] }[],
): Promise<void> => {
  await db.transaction(async (tx) => {
    await tx
      .insert(platforms)
      .values(known.map(({ name, nameKey }) => ({ name, nameKey })))
      .onConflictDoNothing({ target: platforms.nameKey });
    const saved = await tx
      .select({ id: platforms.id, nameKey: platforms.nameKey })
      .from(platforms)
      .where(
        inArray(
          platforms.nameKey,
          known.map((platform) => platform.nameKey),
        ),
      );
    const idOf = new Map(saved.map((platform) => [platform.nameKey, platform.id]));
    const domains = known.flatMap(({ nameKey, domains: names }) => {
      const platformId = idOf.get(nameKey);
      return platformId === undefined ? [] : names.map((domain) => ({ platformId, domain }));
    });
    if (domains.length > 0) await tx.insert(platformDomains).values(domains).onConflictDoNothing();
  });
};

/**
 * Every known sender domain with its platform (RG-10): a small reference table, read whole.
 * @req RG-10, EF-GML-10
 */
export const findPlatformDomains = async (
  db: Executor,
): Promise<Map<string, { id: number; name: string }>> => {
  const rows = await db
    .select({ domain: platformDomains.domain, id: platforms.id, name: platforms.name })
    .from(platformDomains)
    .innerJoin(platforms, eq(platforms.id, platformDomains.platformId));
  return new Map(rows.map(({ domain, id, name }) => [domain.toLowerCase(), { id, name }]));
};

/**
 * Which of these Gmail messages the user already processed (EF-GML-06), whatever the outcome.
 * @req EF-GML-06, ENF-FIA-03
 */
export const findProcessedMessageIds = async (
  db: Executor,
  userId: number,
  gmailMessageIds: readonly string[],
): Promise<Set<string>> => {
  const found = new Set<string>();
  for (const ids of slices(gmailMessageIds)) {
    const rows = await db
      .select({ id: processedMessages.gmailMessageId })
      .from(processedMessages)
      .where(and(eq(processedMessages.userId, userId), inArray(processedMessages.gmailMessageId, ids)));
    for (const row of rows) found.add(row.id);
  }
  return found;
};

/**
 * Marks Gmail messages as processed, without any content (Q-08); a message already marked keeps its first outcome.
 * @req EF-GML-06, ENF-FIA-03, ENF-RGP-01
 */
export const insertProcessedMessages = async (
  db: Executor,
  processed: {
    userId: number;
    gmailMessageIds: readonly string[];
    outcome: (typeof messageOutcome.enumValues)[number];
    processedAt: Date;
  },
): Promise<void> => {
  const { userId, outcome, processedAt } = processed;
  for (const ids of slices(processed.gmailMessageIds)) {
    await db
      .insert(processedMessages)
      .values(ids.map((gmailMessageId) => ({ userId, gmailMessageId, outcome, processedAt })))
      .onConflictDoNothing();
  }
};

/**
 * Returns the id of the platform with this normalized name, recording it when absent (EF-GML-10).
 * @req EF-GML-10, RG-14
 */
export const upsertPlatform = async (db: Executor, platform: { name: string; nameKey: string }): Promise<number> => {
  const [row] = await db
    .insert(platforms)
    .values(platform)
    .onConflictDoUpdate({
      target: platforms.nameKey,
      // No-op update so that RETURNING yields the existing row.
      set: { nameKey: sql`excluded.name_key` },
    })
    .returning({ id: platforms.id });
  if (!row) throw new Error('platform upsert returned no row');
  return row.id;
};

/**
 * Stores a classified message: metadata and excerpt only (ENF-RGP-01). Its `processed_messages` row must exist.
 * @returns the id of the stored message.
 * @req EF-GML-08, ENF-RGP-01
 */
export const insertEmail = async (
  db: Executor,
  email: Omit<typeof emails.$inferInsert, 'id' | 'applicationId'>,
): Promise<number> => {
  const [row] = await db.insert(emails).values(email).returning({ id: emails.id });
  if (!row) throw new Error('email insert returned no row');
  return row.id;
};

/** A stored message to read again (EF-GML-20): what RG-17 reads of it besides its body, and what it lacks. */
export interface StoredMessage {
  id: number;
  gmailMessageId: string;
  subject: string | null;
  snippet: string | null;
  category: (typeof emails.$inferSelect)['category'];
  contactAddress: string | null;
}

const storedMessageColumns = {
  id: emails.id,
  gmailMessageId: emails.gmailMessageId,
  subject: emails.subject,
  snippet: emails.snippet,
  category: emails.category,
  contactAddress: emails.contactAddress,
};

/**
 * The received messages of the user stored under this category, oldest first (RG-04 order).
 * @req EF-GML-20
 */
export const listReceivedEmails = async (
  db: Executor,
  userId: number,
  category: (typeof emails.$inferSelect)['category'],
): Promise<StoredMessage[]> =>
  db
    .select(storedMessageColumns)
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.category, category), eq(emails.direction, 'inbound')))
    .orderBy(emails.receivedAt, emails.id);

/**
 * RG-20: the user's stored messages still without a contact address — stored before it was kept, or from an address
 * that takes no answer — oldest first. Job alerts are left out: nobody is followed up through them.
 * @req RG-20, EF-GML-20
 */
export const listEmailsWithoutContact = async (db: Executor, userId: number): Promise<StoredMessage[]> =>
  db
    .select(storedMessageColumns)
    .from(emails)
    .where(and(eq(emails.userId, userId), isNull(emails.contactAddress), ne(emails.category, 'job_alert')))
    .orderBy(emails.receivedAt, emails.id);

/**
 * Keeps the contact address found for a stored message (RG-20).
 * @req RG-20
 */
export const setEmailContact = async (db: Executor, emailId: number, contactAddress: string): Promise<void> => {
  await db.update(emails).set({ contactAddress }).where(eq(emails.id, emailId));
};

/**
 * Files a stored message under another category (EF-GML-20); its application is the caller's.
 * @req EF-GML-20
 */
export const setEmailCategory = async (
  db: Executor,
  emailId: number,
  category: (typeof emails.$inferSelect)['category'],
): Promise<void> => {
  await db.update(emails).set({ category }).where(eq(emails.id, emailId));
};

/**
 * Sets the date of the last complete synchronisation, from which the next one reads (EF-CFG-01, EF-GML-06).
 * @req EF-CFG-01, EF-GML-06
 */
export const setLastSyncAt = async (db: Executor, userId: number, lastSyncAt: Date): Promise<void> => {
  await db.update(gmailAccounts).set({ lastSyncAt }).where(eq(gmailAccounts.userId, userId));
};

/**
 * Label ids already resolved for the user, by label name (EF-GML-13 cache).
 * @req EF-GML-13
 */
export const findGmailLabels = async (db: Executor, userId: number): Promise<Map<string, string>> => {
  const rows = await db
    .select({ name: gmailLabels.name, id: gmailLabels.gmailLabelId })
    .from(gmailLabels)
    .where(eq(gmailLabels.userId, userId));
  return new Map(rows.map((row) => [row.name, row.id]));
};

/** Remembers the Gmail id of a label of the user, replacing a previous one. @req EF-GML-13 */
export const saveGmailLabel = async (
  db: Executor,
  label: { userId: number; name: string; gmailLabelId: string },
): Promise<void> => {
  await db
    .insert(gmailLabels)
    .values(label)
    .onConflictDoUpdate({
      target: [gmailLabels.userId, gmailLabels.name],
      set: { gmailLabelId: label.gmailLabelId },
    });
};

/** Forgets every label id of the user (one was refused by Gmail). @req EF-GML-13 */
export const deleteGmailLabels = async (db: Executor, userId: number): Promise<void> => {
  await db.delete(gmailLabels).where(eq(gmailLabels.userId, userId));
};

/**
 * EF-CFG-01: instant the last Gmail pass of this user ended well, whatever it processed — what the settings screen
 * calls the last synchronisation. `gmail_accounts.last_sync_at` is another thing: the date up to which every message
 * is processed, which only moves once a pass leaves nothing behind (EF-GML-06).
 */
export const findLastGmailRunAt = async (db: Executor, userId: number): Promise<Date | null> => {
  const [row] = await db
    .select({ finishedAt: jobRuns.finishedAt })
    .from(jobRuns)
    .where(and(eq(jobRuns.userId, userId), eq(jobRuns.job, 'gmail_sync'), eq(jobRuns.outcome, 'success')))
    .orderBy(desc(jobRuns.finishedAt))
    .limit(1);
  return row?.finishedAt ?? null;
};

/** Whether the user lets Tracandi write labels in Gmail (EF-GML-17); null when the settings row is missing. */
export const findSyncPreferences = async (
  db: Executor,
  userId: number,
): Promise<{ applyLabels: boolean; lookbackDays: number } | null> => {
  const [row] = await db
    .select({ applyLabels: appSettings.gmailApplyLabels, lookbackDays: appSettings.gmailLookbackDays })
    .from(appSettings)
    .where(eq(appSettings.userId, userId));
  return row ?? null;
};

/**
 * Changes the synchronisation settings of the user; a setting left out keeps its value.
 * @req EF-GML-17, EF-CFG-04
 */
export const setSyncPreferences = async (
  db: Executor,
  userId: number,
  changes: { applyLabels?: boolean; lookbackDays?: number },
): Promise<void> => {
  await db
    .update(appSettings)
    .set({
      ...(changes.applyLabels === undefined ? {} : { gmailApplyLabels: changes.applyLabels }),
      ...(changes.lookbackDays === undefined ? {} : { gmailLookbackDays: changes.lookbackDays }),
    })
    .where(eq(appSettings.userId, userId));
};

/**
 * Q-11: marks the Gmail connection of the user as expired; the scheduler leaves it until a new connection.
 * @req Q-11
 */
export const markAuthorizationExpired = async (db: Executor, userId: number, expiredAt: Date): Promise<void> => {
  await db.update(gmailAccounts).set({ authorizationExpiredAt: expiredAt }).where(eq(gmailAccounts.userId, userId));
};

/**
 * Users whose mailbox the scheduler synchronises: connected, authorisation not expired (EF-GML-03, Q-11). One row per
 * connected user: the whole (small) table is read.
 * @req EF-GML-03, Q-11
 */
export const listSyncableUserIds = async (db: Executor): Promise<number[]> => {
  const rows = await db
    .select({ userId: gmailAccounts.userId })
    .from(gmailAccounts)
    .where(isNull(gmailAccounts.authorizationExpiredAt))
    .orderBy(gmailAccounts.userId);
  return rows.map((row) => row.userId);
};

/** What a follow-up is prepared from (EF-CAN-17): the application, and where to write. */
export interface FollowUpContext {
  company: string;
  jobTitle: string;
  status: (typeof applications.$inferSelect)['status'];
  appliedAt: Date;
  lastActivityAt: Date;
  /**
   * RG-20: the contacts of the most recent messages that carry one, most recent first, with their thread — the
   * service still sets aside those the rule now refuses, stored before it was refined.
   */
  contacts: { address: string; gmailThreadId: string }[];
}

/** Recent contacts looked at for a follow-up: enough to pass over a few automated messages. */
const FOLLOW_UP_CONTACTS_LOOKED_AT = 20;

/**
 * One application of the user with its most recent contact addresses (RG-20), or null when absent or owned by another
 * user (EF-AUT-06). Served by `ix_emails_application_received`.
 * @req EF-CAN-17, RG-20, EF-AUT-06
 */
export const findFollowUpContext = async (
  db: Executor,
  userId: number,
  applicationId: number,
): Promise<FollowUpContext | null> => {
  const [application] = await db
    .select({
      company: companies.name,
      jobTitle: applications.jobTitle,
      status: applications.status,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
    })
    .from(applications)
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(and(eq(applications.id, applicationId), eq(companies.userId, userId)));
  if (!application) return null;
  const contacts = await db
    .select({ address: emails.contactAddress, gmailThreadId: emails.gmailThreadId })
    .from(emails)
    .where(and(eq(emails.applicationId, applicationId), isNotNull(emails.contactAddress)))
    .orderBy(desc(emails.receivedAt), desc(emails.id))
    .limit(FOLLOW_UP_CONTACTS_LOOKED_AT);
  return {
    ...application,
    contacts: contacts.flatMap(({ address, gmailThreadId }) => (address ? [{ address, gmailThreadId }] : [])),
  };
};

