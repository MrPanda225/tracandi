import { asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  applications,
  applicationStatusHistory,
  appSettings,
  candidateProfiles,
  companies,
  cvVersions,
  emails,
  gmailAccounts,
  jobOffers,
  jobRuns,
  llmCalls,
  platforms,
  prefilterKeywords,
  processedMessages,
  users,
  watchedSites,
} from '../../db/schema.js';

/*
 * EF-AUT-12: every row held on one user, read with named columns — never a password hash, a session nor a token
 * (ENF-SEC-02). Shared reference data (platforms, AI prices) is not the user's and stays out.
 */

/** The account, its settings, its Gmail connection (no token) and its profile. */
export const readAccountData = async (db: Database, userId: number) => {
  const [account, settings, gmail, profile, keywords] = await Promise.all([
    db.select({ email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    db
      .select({
        followUpDays: appSettings.followUpDays,
        offerAlertThreshold: appSettings.offerAlertThreshold,
        gmailLookbackDays: appSettings.gmailLookbackDays,
        gmailApplyLabels: appSettings.gmailApplyLabels,
      })
      .from(appSettings)
      .where(eq(appSettings.userId, userId)),
    db
      .select({
        emailAddress: gmailAccounts.emailAddress,
        connectedAt: gmailAccounts.connectedAt,
        lastSyncAt: gmailAccounts.lastSyncAt,
        authorizationExpiredAt: gmailAccounts.authorizationExpiredAt,
      })
      .from(gmailAccounts)
      .where(eq(gmailAccounts.userId, userId)),
    db
      .select({ document: candidateProfiles.document, updatedAt: candidateProfiles.updatedAt })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.userId, userId)),
    db
      .select({ keyword: prefilterKeywords.keyword })
      .from(prefilterKeywords)
      .where(eq(prefilterKeywords.userId, userId)),
  ]);
  return {
    account: account[0] ?? null,
    settings: settings[0] ?? null,
    gmail: gmail[0] ?? null,
    profile: profile[0] ?? null,
    prefilterKeywords: keywords.map((row) => row.keyword),
  };
};

/** The companies of the user, and their applications. */
export const readApplications = async (db: Database, userId: number) => {
  const owned = await db
    .select({ id: companies.id, name: companies.name, createdAt: companies.createdAt })
    .from(companies)
    .where(eq(companies.userId, userId))
    .orderBy(asc(companies.name));
  const companyIds = owned.map((company) => company.id);
  if (companyIds.length === 0) return { companies: owned, applications: [], cvVersions: [] };
  const [rows, versions] = await Promise.all([
    db
      .select({
        id: applications.id,
        companyId: applications.companyId,
        jobTitle: applications.jobTitle,
        contractType: applications.contractType,
        status: applications.status,
        source: applications.source,
        platform: platforms.name,
        notes: applications.notes,
        offerDescription: applications.offerDescription,
        appliedAt: applications.appliedAt,
        lastActivityAt: applications.lastActivityAt,
      })
      .from(applications)
      .leftJoin(platforms, eq(platforms.id, applications.platformId))
      .where(inArray(applications.companyId, companyIds)),
    db
      .select({
        companyId: cvVersions.companyId,
        jobTitle: cvVersions.jobTitle,
        label: cvVersions.label,
        content: cvVersions.content,
        createdAt: cvVersions.createdAt,
      })
      .from(cvVersions)
      .where(inArray(cvVersions.companyId, companyIds)),
  ]);
  return { companies: owned, applications: rows, cvVersions: versions };
};

/** The status history of these applications, oldest first. */
export const readStatusHistory = async (db: Database, applicationIds: readonly number[]) =>
  applicationIds.length === 0
    ? []
    : db
        .select({
          applicationId: applicationStatusHistory.applicationId,
          status: applicationStatusHistory.status,
          changedAt: applicationStatusHistory.changedAt,
          origin: applicationStatusHistory.origin,
        })
        .from(applicationStatusHistory)
        .where(inArray(applicationStatusHistory.applicationId, [...applicationIds]))
        .orderBy(asc(applicationStatusHistory.changedAt));

/** The messages kept from the mailbox (ENF-RGP-01), and the ids of every message processed. */
export const readMessages = async (db: Database, userId: number) => {
  const [kept, processed] = await Promise.all([
    db
      .select({
        applicationId: emails.applicationId,
        gmailMessageId: emails.gmailMessageId,
        gmailThreadId: emails.gmailThreadId,
        direction: emails.direction,
        fromAddress: emails.fromAddress,
        contactAddress: emails.contactAddress,
        subject: emails.subject,
        snippet: emails.snippet,
        category: emails.category,
        platform: platforms.name,
        receivedAt: emails.receivedAt,
        classifiedBy: emails.classifiedBy,
      })
      .from(emails)
      .leftJoin(platforms, eq(platforms.id, emails.platformId))
      .where(eq(emails.userId, userId))
      .orderBy(asc(emails.receivedAt)),
    db
      .select({
        gmailMessageId: processedMessages.gmailMessageId,
        outcome: processedMessages.outcome,
        processedAt: processedMessages.processedAt,
      })
      .from(processedMessages)
      .where(eq(processedMessages.userId, userId)),
  ]);
  return { emails: kept, processedMessages: processed };
};

/** The sources watched for these companies, and the offers read on them. */
export const readWatch = async (db: Database, companyIds: readonly number[]) => {
  if (companyIds.length === 0) return { watchedSites: [], jobOffers: [] };
  const sites = await db
    .select({
      id: watchedSites.id,
      companyId: watchedSites.companyId,
      adapter: watchedSites.adapter,
      identifier: watchedSites.identifier,
      isActive: watchedSites.isActive,
      lastCheckedAt: watchedSites.lastCheckedAt,
      createdAt: watchedSites.createdAt,
    })
    .from(watchedSites)
    .where(inArray(watchedSites.companyId, [...companyIds]));
  const siteIds = sites.map((site) => site.id);
  const offers =
    siteIds.length === 0
      ? []
      : await db
          .select({
            siteId: jobOffers.siteId,
            title: jobOffers.title,
            location: jobOffers.location,
            url: jobOffers.url,
            relevanceScore: jobOffers.relevanceScore,
            status: jobOffers.status,
            firstSeenAt: jobOffers.firstSeenAt,
          })
          .from(jobOffers)
          .where(inArray(jobOffers.siteId, siteIds));
  return { watchedSites: sites, jobOffers: offers };
};

/** The executions of the user (synchronisations, watch) and the journal of their AI calls, never a prompt. */
export const readActivity = async (db: Database, userId: number) => {
  const [runs, calls] = await Promise.all([
    db
      .select({
        job: jobRuns.job,
        trigger: jobRuns.triggerType,
        outcome: jobRuns.outcome,
        startedAt: jobRuns.startedAt,
        finishedAt: jobRuns.finishedAt,
      })
      .from(jobRuns)
      .where(eq(jobRuns.userId, userId)),
    db
      .select({
        task: llmCalls.task,
        provider: llmCalls.provider,
        model: llmCalls.model,
        outcome: llmCalls.outcome,
        inputTokens: llmCalls.inputTokens,
        outputTokens: llmCalls.outputTokens,
        calledAt: llmCalls.calledAt,
      })
      .from(llmCalls)
      .where(eq(llmCalls.userId, userId)),
  ]);
  return { executions: runs, aiUsage: calls };
};
