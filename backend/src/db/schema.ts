/**
 * Physical data model (source of truth, ADR-03). Third normal form: `user_id` only on root entities, other tables
 * inherit ownership through their foreign keys (EF-AUT-06). Columns are camelCase here and snake_case in the database
 * (`casing: 'snake_case'` in the client and in drizzle.config.ts).
 * Derived values (follow-up flag RG-06, response rate RG-07, keyword coverage EF-CVX-16, AI cost EF-CFG-03) are
 * computed on read and never stored. Accepted redundancy: `applications.status` and `lastActivityAt`, updated in the
 * same transaction as the status history, to serve the filter and follow-up indexes.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

// ADR-07: absolute instants, millisecond precision, UTC.
const instant = () => timestamp({ precision: 3, withTimezone: true, mode: 'date' });
const createdAt = () => instant().notNull().defaultNow();

// ---------- Enumerations ----------
export const contractType = pgEnum('contract_type', [
  'cdi',
  'cdd',
  'alternance',
  'job_etudiant',
  'autre',
  'non_precise',
]);
export const applicationStatus = pgEnum('application_status', [
  'to_apply',
  'sent',
  'acknowledged',
  'interview',
  'offer',
  'rejected',
]);
export const applicationSource = pgEnum('application_source', ['email', 'offer', 'manual']);
export const statusChangeOrigin = pgEnum('status_change_origin', ['email', 'manual', 'offer']);
export const emailDirection = pgEnum('email_direction', ['inbound', 'outbound']);
export const emailCategory = pgEnum('email_category', [
  'sent_application',
  'acknowledged',
  'interview',
  'offer',
  'rejected',
  'job_alert',
]);
// Who classified a message: one of the AI route entries of RG-13, or the candidate (EF-CAN-10).
export const classifier = pgEnum('classifier', ['claude', 'gemini', 'groq_1', 'groq_2', 'groq_3', 'manual']);
export const messageOutcome = pgEnum('message_outcome', ['retained', 'prefiltered', 'off_topic']);
export const siteAdapter = pgEnum('site_adapter', [
  'greenhouse',
  'lever',
  'smartrecruiters',
  'recruitee',
  'workday',
  'generic',
]);
export const offerStatus = pgEnum('offer_status', ['new', 'saved', 'dismissed', 'applied']);
// RG-13 (v1.8): one value per route entry. The three Groq entries are numbered slots, not model families: the
// catalogue of a free account changes, the model of each slot is configured (rules/llm.md) and journaled beside it.
export const llmProvider = pgEnum('llm_provider', ['claude', 'gemini', 'groq_1', 'groq_2', 'groq_3']);
export const llmTask = pgEnum('llm_task', [
  'classify_emails',
  'score_offers',
  'extract_offers',
  'tailor_cv',
  'write_motivation',
]);
export const llmOutcome = pgEnum('llm_outcome', ['success', 'error', 'timeout', 'invalid_output']);
export const jobName = pgEnum('job_name', ['gmail_sync', 'scraper', 'backup']);
export const triggerType = pgEnum('trigger_type', ['schedule', 'manual']);
// EF-EXE-01 à 03 : une exécution attend son tour (`queued`) avant de tourner, de réussir, d'échouer ou d'être
// écartée parce qu'une autre du même travail était déjà en file.
export const runOutcome = pgEnum('run_outcome', [
  'queued',
  'running',
  'success',
  'failure',
  'skipped',
]);
export const runCounter = pgEnum('run_counter', [
  'messages_read',
  'messages_retained',
  'messages_classified',
  'messages_pending',
  'sources_checked',
  'offers_new',
  'offers_relevant',
]);

// ---------- Accounts (EF-AUT, ADR-09) ----------
export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: 254 }).notNull().unique('uq_users_email'),
  passwordHash: text().notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // ENF-SEC-20: only the SHA-256 digest of the token is stored.
    tokenHash: bytea().notNull().unique('uq_sessions_token_hash'),
    createdAt: createdAt(),
    expiresAt: instant().notNull(),
  },
  (t) => [index('ix_sessions_user').on(t.userId)],
);

export const appSettings = pgTable(
  'app_settings',
  {
    userId: integer()
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    followUpDays: smallint().notNull().default(10),
    offerAlertThreshold: smallint().notNull().default(60),
    coverageThreshold: smallint().notNull().default(60),
    gmailLookbackDays: smallint().notNull().default(30),
    gmailApplyLabels: boolean().notNull().default(true),
  },
  (t) => [
    check('ck_app_settings_follow_up_days', sql`${t.followUpDays} between 1 and 365`),
    check('ck_app_settings_offer_alert_threshold', sql`${t.offerAlertThreshold} between 0 and 100`),
    check('ck_app_settings_coverage_threshold', sql`${t.coverageThreshold} between 0 and 100`),
    check('ck_app_settings_gmail_lookback_days', sql`${t.gmailLookbackDays} between 1 and 365`),
  ],
);

/**
 * EF-CVX-01, EF-CVX-02, Q-16: the reference profile of a candidate, one document per user. It is the single source
 * of every generated CV (RG-12) and of the targets that score the offers (RG-09); the application validates it
 * against `CandidateProfileSchema` before every write and after every read.
 */
export const candidateProfiles = pgTable('candidate_profiles', {
  userId: integer()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  document: jsonb().notNull(),
  updatedAt: instant().notNull().defaultNow(),
});

// ---------- Reference data ----------
export const companies = pgTable(
  'companies',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 160 }).notNull(),
    // RG-14 normalized key, computed by the application.
    nameKey: varchar({ length: 160 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('uq_companies_user_name_key').on(t.userId, t.nameKey),
    // EF-CAN-03 / Q-05: substring search without a full scan.
    index('ix_companies_name_key_trgm').using('gin', sql`${t.nameKey} gin_trgm_ops`),
  ],
);

export const platforms = pgTable('platforms', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 120 }).notNull(),
  nameKey: varchar({ length: 120 }).notNull().unique('uq_platforms_name_key'),
});

export const platformDomains = pgTable(
  'platform_domains',
  {
    platformId: integer()
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    domain: varchar({ length: 253 }).notNull().unique('uq_platform_domains_domain'),
  },
  (t) => [primaryKey({ name: 'pk_platform_domains', columns: [t.platformId, t.domain] })],
);

export const prefilterKeywords = pgTable(
  'prefilter_keywords',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    keyword: varchar({ length: 80 }).notNull(),
  },
  (t) => [primaryKey({ name: 'pk_prefilter_keywords', columns: [t.userId, t.keyword] })],
);

// ---------- Job offers watch ----------
export const watchedSites = pgTable(
  'watched_sites',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    companyId: integer()
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    adapter: siteAdapter().notNull(),
    // RG-08: ATS slug (lower case) or https URL.
    identifier: varchar({ length: 500 }).notNull(),
    isActive: boolean().notNull().default(true),
    lastCheckedAt: instant(),
    lastError: varchar({ length: 500 }),
    createdAt: createdAt(),
  },
  (t) => [unique('uq_watched_sites_source').on(t.companyId, t.adapter, t.identifier)],
);

/**
 * EF-VEI-25 : les propositions de source que le candidat a écartées. Sans cette trace, la même entreprise lui
 * serait reproposée à chaque ouverture de l'écran.
 */
export const dismissedSourceSuggestions = pgTable(
  'dismissed_source_suggestions',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: integer()
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    dismissedAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'pk_dismissed_source_suggestions', columns: [t.userId, t.companyId] }),
  ],
);

export const jobOffers = pgTable(
  'job_offers',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    siteId: integer()
      .notNull()
      .references(() => watchedSites.id, { onDelete: 'cascade' }),
    externalId: varchar({ length: 255 }).notNull(),
    title: varchar({ length: 300 }).notNull(),
    location: varchar({ length: 200 }),
    contractType: contractType().notNull().default('non_precise'),
    url: varchar({ length: 1000 }).notNull(),
    description: text(),
    postedAt: instant(),
    firstSeenAt: createdAt(),
    relevanceScore: smallint(),
    relevanceReason: varchar({ length: 500 }),
    // Label of the profile target (targets live in the user profile, Q-16).
    matchedTarget: varchar({ length: 120 }),
    status: offerStatus().notNull().default('new'),
  },
  (t) => [
    unique('uq_job_offers_source_item').on(t.siteId, t.externalId),
    check('ck_job_offers_score', sql`${t.relevanceScore} is null or ${t.relevanceScore} between 0 and 100`),
    // EF-VEI-16/17, EF-TDB-08
    index('ix_job_offers_status_score').on(t.status, t.relevanceScore),
    // EF-VEI-22
    index('ix_job_offers_contract_type').on(t.contractType),
  ],
);

// ---------- CV ----------
export const cvVersions = pgTable(
  'cv_versions',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // Snapshot of what the CV was made for: survives the removal of the offer (EF-VEI-05, Q-12).
    companyId: integer()
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    offerId: integer().references(() => jobOffers.id, { onDelete: 'set null' }),
    jobTitle: varchar({ length: 300 }).notNull(),
    label: varchar({ length: 300 }).notNull(),
    content: jsonb().notNull(),
    // ENF-SEC-13: file name generated by the server.
    fileStem: uuid().notNull().unique('uq_cv_versions_file_stem'),
    provider: llmProvider().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ix_cv_versions_company_created').on(t.companyId, t.createdAt)],
);

export const cvKeywords = pgTable(
  'cv_keywords',
  {
    cvVersionId: integer()
      .notNull()
      .references(() => cvVersions.id, { onDelete: 'cascade' }),
    keyword: varchar({ length: 120 }).notNull(),
    isCovered: boolean().notNull(),
  },
  (t) => [primaryKey({ name: 'pk_cv_keywords', columns: [t.cvVersionId, t.keyword] })],
);

// ---------- Applications ----------
export const applications = pgTable(
  'applications',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    companyId: integer()
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    jobTitle: varchar({ length: 300 }).notNull().default('Candidature'),
    // RG-14 normalized key of jobTitle.
    jobTitleKey: varchar({ length: 300 }).notNull(),
    contractType: contractType().notNull().default('non_precise'),
    status: applicationStatus().notNull().default('sent'),
    source: applicationSource().notNull(),
    platformId: integer().references(() => platforms.id, { onDelete: 'set null' }),
    offerId: integer()
      .references(() => jobOffers.id, { onDelete: 'set null' })
      .unique('uq_applications_offer'),
    cvVersionId: integer().references(() => cvVersions.id, { onDelete: 'set null' }),
    notes: varchar({ length: 2000 }),
    // EF-CAN-15: read only in the detail of one application, never filtered or sorted — no index.
    offerDescription: varchar({ length: 20000 }),
    appliedAt: createdAt(),
    lastActivityAt: createdAt(),
  },
  (t) => [
    // RG-03: an application is identified by (company, job title).
    unique('uq_applications_company_title').on(t.companyId, t.jobTitleKey),
    // EF-CAN-02, RG-06 follow-ups
    index('ix_applications_status_activity').on(t.status, t.lastActivityAt),
    // EF-CAN-14, EF-TDB-09
    index('ix_applications_contract_status').on(t.contractType, t.status),
    // RG-03 (c): most recent application of a company
    index('ix_applications_company_activity').on(t.companyId, t.lastActivityAt),
    // EF-TDB-04 weekly histogram
    index('ix_applications_applied').on(t.appliedAt),
    // EF-CAN-03 / Q-05
    index('ix_applications_job_title_key_trgm').using('gin', sql`${t.jobTitleKey} gin_trgm_ops`),
  ],
);

// ---------- Gmail ----------
export const processedMessages = pgTable(
  'processed_messages',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gmailMessageId: varchar({ length: 64 }).notNull(),
    processedAt: createdAt(),
    outcome: messageOutcome().notNull(),
  },
  // Q-08, EF-GML-06, ENF-FIA-03: idempotence without keeping any content.
  (t) => [primaryKey({ name: 'pk_processed_messages', columns: [t.userId, t.gmailMessageId] })],
);

export const emails = pgTable(
  'emails',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer().notNull(),
    gmailMessageId: varchar({ length: 64 }).notNull(),
    gmailThreadId: varchar({ length: 64 }).notNull(),
    applicationId: integer().references(() => applications.id, { onDelete: 'set null' }),
    direction: emailDirection().notNull(),
    fromAddress: varchar({ length: 320 }),
    subject: varchar({ length: 500 }),
    // ENF-RGP-01: never the full body.
    snippet: varchar({ length: 300 }),
    category: emailCategory().notNull(),
    platformId: integer().references(() => platforms.id, { onDelete: 'set null' }),
    receivedAt: instant().notNull(),
    classifiedBy: classifier(),
  },
  (t) => [
    unique('uq_emails_user_message').on(t.userId, t.gmailMessageId),
    foreignKey({
      name: 'fk_emails_processed_message',
      columns: [t.userId, t.gmailMessageId],
      foreignColumns: [processedMessages.userId, processedMessages.gmailMessageId],
    }).onDelete('cascade'),
    // EF-CAN-04 chronology
    index('ix_emails_application_received').on(t.applicationId, t.receivedAt),
    // EF-GML-13/14 labels by thread
    index('ix_emails_user_thread').on(t.userId, t.gmailThreadId),
  ],
);

export const applicationStatusHistory = pgTable(
  'application_status_history',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    applicationId: integer()
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    status: applicationStatus().notNull(),
    changedAt: instant().notNull(),
    origin: statusChangeOrigin().notNull(),
    emailId: integer().references(() => emails.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('ix_status_history_application_changed').on(t.applicationId, t.changedAt),
    // Q-06: EF-TDB-02 (reached interview) and EF-TDB-04 (weekly counts)
    index('ix_status_history_status_changed').on(t.status, t.changedAt),
  ],
);

export const gmailAccounts = pgTable('gmail_accounts', {
  userId: integer()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailAddress: varchar({ length: 320 }).notNull(),
  // ENF-SEC-02: AES-256-GCM ciphertext, initialization vector and authentication tag.
  refreshTokenEnc: bytea().notNull(),
  tokenIv: bytea().notNull(),
  tokenTag: bytea().notNull(),
  historyId: varchar({ length: 32 }),
  connectedAt: createdAt(),
  lastSyncAt: instant(),
  // Q-11: set when Google refuses the refresh token (invalid_grant); cleared by a new connection. Never filtered on
  // its own (read with the account row): no index.
  authorizationExpiredAt: instant(),
});

export const gmailLabels = pgTable(
  'gmail_labels',
  {
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 225 }).notNull(),
    gmailLabelId: varchar({ length: 64 }).notNull(),
  },
  (t) => [primaryKey({ name: 'pk_gmail_labels', columns: [t.userId, t.name] })],
);

// ---------- Operations ----------
export const jobRuns = pgTable(
  'job_runs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    job: jobName().notNull(),
    triggerType: triggerType().notNull(),
    startedAt: createdAt(),
    finishedAt: instant(),
    outcome: runOutcome().notNull().default('running'),
    error: varchar({ length: 1000 }),
  },
  // EF-GML-18, EF-CFG-01: last run per job
  (t) => [index('ix_job_runs_user_job_started').on(t.userId, t.job, t.startedAt)],
);

export const jobRunCounters = pgTable(
  'job_run_counters',
  {
    runId: integer()
      .notNull()
      .references(() => jobRuns.id, { onDelete: 'cascade' }),
    counter: runCounter().notNull(),
    value: integer().notNull(),
  },
  (t) => [primaryKey({ name: 'pk_job_run_counters', columns: [t.runId, t.counter] })],
);

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    task: llmTask().notNull(),
    provider: llmProvider().notNull(),
    model: varchar({ length: 80 }).notNull(),
    outcome: llmOutcome().notNull(),
    durationMs: integer().notNull(),
    inputTokens: integer(),
    outputTokens: integer(),
    calledAt: createdAt(),
  },
  // ENF-COU-01, EF-CFG-03: monthly cost per user
  (t) => [index('ix_llm_calls_user_called').on(t.userId, t.calledAt)],
);

export const llmModelPrices = pgTable(
  'llm_model_prices',
  {
    provider: llmProvider().notNull(),
    model: varchar({ length: 80 }).notNull(),
    validFrom: date({ mode: 'string' }).notNull(),
    inputEurPerMtok: numeric({ precision: 10, scale: 4 }).notNull(),
    outputEurPerMtok: numeric({ precision: 10, scale: 4 }).notNull(),
  },
  (t) => [primaryKey({ name: 'pk_llm_model_prices', columns: [t.provider, t.model, t.validFrom] })],
);
