import { sql } from 'drizzle-orm';
import { normalizeKey } from '../lib/text.js';
import type { Database } from './client.js';
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
} from './schema.js';

type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
type EmailCategory = (typeof emailCategory.enumValues)[number];

/** ENF-PERF-01: the volume of the main user — 1 000 applications, 10 000 messages, 5 000 offers. */
export const MAIN_USER_LOAD = {
  companies: 200,
  applications: 1_000,
  messages: 10_000,
  sites: 20,
  offers: 5_000,
};
/** The other users weigh a tenth: their rows are there so that every query must filter by user (EF-AUT-06). */
export const OTHER_USER_LOAD = { companies: 20, applications: 100, messages: 1_000, sites: 2, offers: 500 };
type Load = typeof MAIN_USER_LOAD;

/** Same seed, same data: a measure can be compared from one run to the next. */
export const DEFAULT_SEED = 703;
export const DEFAULT_USERS = 3;
const INSERT_CHUNK = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
// EF-CAN-23 « réparties sur 12 mois » (T-703): applications sent during the last year.
const SPREAD_DAYS = 365;

/** Mulberry32: a small deterministic pseudo-random generator, enough for fictitious data (never for security). */
const randomFrom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
};

type Random = () => number;
const pickOf = <T>(random: Random, values: readonly T[]): T =>
  values[Math.floor(random() * values.length)] as T;
const integerBelow = (random: Random, bound: number): number => Math.floor(random() * bound);

/**
 * Share of each final status, as a candidate's tracking sheet shows it: most applications wait, a fifth are refused.
 * Typed on the enumeration, so that a new status (T-904) must get its share here.
 */
const STATUS_WEIGHTS: Record<ApplicationStatus, number> = {
  to_apply: 5,
  sent: 35,
  acknowledged: 20,
  technical_test: 3,
  interview: 12,
  offer: 3,
  rejected: 22,
};
const STATUS_ORDER = applicationStatus.enumValues;

const weightedStatus = (random: Random): ApplicationStatus => {
  const total = Object.values(STATUS_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let draw = random() * total;
  for (const status of STATUS_ORDER) {
    draw -= STATUS_WEIGHTS[status];
    if (draw < 0) return status;
  }
  return 'sent';
};

const COMPANY_WORDS = [
  'Atelier',
  'Cobalt',
  'Brume',
  'Delta',
  'Éole',
  'Forge',
  'Galet',
  'Hublot',
  'Iris',
  'Jade',
];
// No legal form nor « Group » / « France »: two names must never share an RG-26 key.
const COMPANY_SUFFIXES = [
  'Conseil',
  'Numérique',
  'Logistique',
  'Santé',
  'Studio',
  'Labs',
  'Énergies',
  'Média',
  'Finance',
  'Retail',
  'Industries',
  'Assurances',
  'Transports',
  'Éditions',
  'Hôtels',
  'Services',
  'Data',
  'Systèmes',
  'Partenaires',
  'Solutions',
];
// Distinct RG-25 keys: a company never gets the same job twice.
export const JOB_TITLES = [
  'Data analyst H/F',
  'Développeur web',
  'Développeur front (F/H) - CDI',
  'Data engineer',
  'Analyste BI',
  'Chargé d’études',
  'Product owner',
  'Business analyst',
  'Contrôleur de gestion',
  'Chef de projet data',
  'Consultant data',
  'Analyste reporting',
  'Ingénieur données',
  'Data scientist',
];
const LOCATIONS = ['Paris', 'Lyon', 'Lille', 'Nantes', 'Bordeaux', 'Toulouse', 'Télétravail'];

/** Fictitious, readable and distinct names: « Atelier Conseil », « Cobalt Numérique 2 »… */
export const companyNameOf = (index: number): string => {
  const base = `${COMPANY_WORDS[index % COMPANY_WORDS.length] ?? ''} ${
    COMPANY_SUFFIXES[Math.floor(index / COMPANY_WORDS.length) % COMPANY_SUFFIXES.length] ?? ''
  }`;
  const round = Math.floor(index / (COMPANY_WORDS.length * COMPANY_SUFFIXES.length));
  return round === 0 ? base : `${base} ${String(round + 1)}`;
};

const keyOf = normalizeKey;

const chunksOf = <T>(rows: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(rows.length / INSERT_CHUNK) }, (_, index) =>
    rows.slice(index * INSERT_CHUNK, (index + 1) * INSERT_CHUNK),
  );

/** One application of the dataset, before insertion. */
interface PlannedApplication {
  companyId: number;
  jobTitle: string;
  status: ApplicationStatus;
  appliedAt: Date;
  lastActivityAt: Date;
}

/** Context shared by the generators of one user. */
interface UserContext {
  db: Database;
  random: Random;
  userId: number;
  now: Date;
  load: Load;
  tag: string;
}

const insertCompanies = async ({ db, userId, load }: UserContext): Promise<number[]> => {
  const rows = Array.from({ length: load.companies }, (_, index) => {
    const name = companyNameOf(index);
    return { userId, name, nameKey: keyOf(name) };
  });
  return (await db.insert(companies).values(rows).returning({ id: companies.id })).map((row) => row.id);
};

/** Applications spread over the last 12 months, each (company, title) once (`uq_applications_company_title`). */
const planApplications = (
  { random, now, load }: UserContext,
  companyIds: readonly number[],
): PlannedApplication[] =>
  Array.from({ length: load.applications }, (_, index) => {
    const appliedAt = new Date(
      now.getTime() - integerBelow(random, SPREAD_DAYS) * DAY_MS - integerBelow(random, DAY_MS),
    );
    const activityDelay = random() * Math.min(now.getTime() - appliedAt.getTime(), 60 * DAY_MS);
    // Every company gets applications, each (company, title) once while the titles last; later rounds are numbered.
    const round = Math.floor(index / companyIds.length);
    const title = JOB_TITLES[round % JOB_TITLES.length] ?? 'Candidature';
    return {
      companyId: companyIds[index % companyIds.length] ?? 0,
      jobTitle: round < JOB_TITLES.length ? title : `${title} ${String(round)}`,
      status: weightedStatus(random),
      appliedAt,
      lastActivityAt: new Date(appliedAt.getTime() + activityDelay),
    };
  });

const insertApplications = async (
  context: UserContext,
  planned: readonly PlannedApplication[],
): Promise<number[]> => {
  const ids: number[] = [];
  for (const chunk of chunksOf(planned)) {
    const inserted = await context.db
      .insert(applications)
      .values(
        chunk.map((application) => ({
          ...application,
          jobTitleKey: keyOf(application.jobTitle),
          contractType: pickOf(context.random, contractType.enumValues),
          source: pickOf(context.random, ['email', 'manual', 'manual'] as const),
        })),
      )
      .returning({ id: applications.id });
    ids.push(...inserted.map((row) => row.id));
  }
  return ids;
};

/** RG-04: the statuses an application went through, in rank order, up to its current one. */
const PATH_TO: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  to_apply: ['to_apply'],
  sent: ['sent'],
  acknowledged: ['sent', 'acknowledged'],
  technical_test: ['sent', 'acknowledged', 'technical_test'],
  interview: ['sent', 'acknowledged', 'interview'],
  offer: ['sent', 'acknowledged', 'interview', 'offer'],
  rejected: ['sent', 'acknowledged', 'rejected'],
};

const insertHistory = async (
  context: UserContext,
  planned: readonly PlannedApplication[],
  ids: readonly number[],
) => {
  const rows = planned.flatMap((application, index) => {
    const steps = PATH_TO[application.status];
    const span = application.lastActivityAt.getTime() - application.appliedAt.getTime();
    return steps.map((status, step) => ({
      applicationId: ids[index] ?? 0,
      status,
      changedAt: new Date(application.appliedAt.getTime() + (span * step) / Math.max(steps.length - 1, 1)),
      origin: step === 0 ? ('manual' as const) : ('email' as const),
    }));
  });
  for (const chunk of chunksOf(rows)) await context.db.insert(applicationStatusHistory).values(chunk);
};

/** Messages received about an application after it was sent, one per step, two for an interview (RG-02). */
const ANSWERS_OF: Record<ApplicationStatus, readonly EmailCategory[]> = {
  to_apply: [],
  sent: [],
  acknowledged: ['acknowledged'],
  technical_test: ['acknowledged', 'technical_test'],
  interview: ['acknowledged', 'interview', 'interview'],
  offer: ['acknowledged', 'interview', 'interview', 'offer'],
  rejected: ['acknowledged', 'rejected'],
};

/** One message of the dataset, before insertion. */
interface PlannedMessage {
  applicationIndex: number | null;
  direction: 'inbound' | 'outbound';
  category: EmailCategory;
  receivedAt: Date;
}

/**
 * The messages of a mailbox: for each application sent, the candidate's message then one answer per step, spread
 * between the application and its last activity; the rest, up to the volume of ENF-PERF-01, are job alerts attached
 * to no application (RG-02), as they are the bulk of a real mailbox.
 */
const planMessages = (
  { random, now, load }: UserContext,
  planned: readonly PlannedApplication[],
): PlannedMessage[] => {
  const messages: PlannedMessage[] = planned.flatMap((application, applicationIndex) => {
    if (application.status === 'to_apply') return [];
    const answers = ANSWERS_OF[application.status];
    const span = application.lastActivityAt.getTime() - application.appliedAt.getTime();
    return [
      {
        applicationIndex,
        direction: 'outbound',
        category: 'sent_application',
        receivedAt: application.appliedAt,
      },
      ...answers.map((category, step) => ({
        applicationIndex,
        direction: 'inbound' as const,
        category,
        receivedAt: new Date(application.appliedAt.getTime() + (span * (step + 1)) / answers.length),
      })),
    ];
  });
  const alerts = Math.max(load.messages - messages.length, 0);
  const alertMessages = Array.from({ length: alerts }, (): PlannedMessage => ({
    applicationIndex: null,
    direction: 'inbound',
    category: 'job_alert',
    receivedAt: new Date(now.getTime() - random() * SPREAD_DAYS * DAY_MS),
  }));
  return [...messages, ...alertMessages].slice(0, load.messages);
};

/** The row of a planned message; a third of the answers, and every alert, come from a no-reply address (RG-20). */
const messageRowOf = (
  context: UserContext,
  { message, index, ids }: { message: PlannedMessage; index: number; ids: readonly number[] },
) => {
  const { random, userId, load, tag } = context;
  const position = message.applicationIndex;
  const domain =
    position === null ? 'alertes.example' : `entreprise-${String(position % load.companies)}.example`;
  const isSent = message.direction === 'outbound';
  const hasContact = position !== null && random() >= 1 / 3;
  return {
    userId,
    gmailMessageId: `${tag}-msg-${String(index).padStart(6, '0')}`,
    gmailThreadId: `${tag}-thread-${position === null ? `alerte-${String(index)}` : String(position).padStart(6, '0')}`,
    applicationId: position === null ? null : (ids[position] ?? null),
    direction: message.direction,
    fromAddress: isSent
      ? `candidat-${tag}@example.test`
      : `${position === null ? 'ne-pas-repondre' : 'rh'}@${domain}`,
    subject: position === null ? 'Nouvelles offres pour vous' : 'Votre candidature',
    snippet: 'Bonjour, nous avons bien reçu votre candidature et revenons vers vous rapidement.',
    contactAddress: hasContact ? `rh@${domain}` : null,
    category: message.category,
    receivedAt: message.receivedAt,
  };
};

const insertMessages = async (
  context: UserContext,
  planned: readonly PlannedApplication[],
  ids: readonly number[],
) => {
  const { db, userId } = context;
  const rows = planMessages(context, planned).map((message, index) =>
    messageRowOf(context, { message, index, ids }),
  );
  for (const chunk of chunksOf(rows)) {
    await db
      .insert(processedMessages)
      .values(
        chunk.map((row) => ({ userId, gmailMessageId: row.gmailMessageId, outcome: 'retained' as const })),
      );
    await db.insert(emails).values(chunk);
  }
};

/** Watched sites and their offers; one offer in a hundred still waits for its score (RG-31). */
const insertOffers = async (context: UserContext, companyIds: readonly number[]) => {
  const { db, random, userId, now, load, tag } = context;
  const siteIds = (
    await db
      .insert(watchedSites)
      .values(
        Array.from({ length: load.sites }, (_, index) => ({
          userId,
          companyId: companyIds[index] ?? null,
          adapter: 'greenhouse' as const,
          identifier: `${tag}-site-${String(index)}`,
        })),
      )
      .returning({ id: watchedSites.id })
  ).map((row) => row.id);
  const rows = Array.from({ length: load.offers }, (_, index) => ({
    siteId: siteIds[index % siteIds.length] ?? 0,
    externalId: `${tag}-offre-${String(index)}`,
    title: pickOf(random, JOB_TITLES),
    location: pickOf(random, LOCATIONS),
    contractType: pickOf(random, contractType.enumValues),
    url: `https://emplois.example.com/${tag}/offres/${String(index)}`,
    postedAt: new Date(now.getTime() - integerBelow(random, 90) * DAY_MS),
    relevanceScore: random() < 0.01 ? null : integerBelow(random, 101),
    status: pickOf(random, offerStatus.enumValues),
  }));
  for (const chunk of chunksOf(rows)) await db.insert(jobOffers).values(chunk);
};

const fillUser = async (context: UserContext): Promise<void> => {
  const companyIds = await insertCompanies(context);
  const planned = planApplications(context, companyIds);
  const ids = await insertApplications(context, planned);
  await insertHistory(context, planned, ids);
  await insertMessages(context, planned, ids);
  await insertOffers(context, companyIds);
};

/** What `seedLoadDataset` does: who, when, and from which seed. */
export interface LoadOptions {
  now: Date;
  seed?: number;
  /** Fictitious users to create; ignored for the main user when `mainUserId` is given. */
  users?: number;
  /** An existing account to fill with the main volume (a tester's account), instead of creating one. */
  mainUserId?: number;
  /** Stored as is for the created users. */
  passwordHash: string;
}

const createUser = async (
  db: Database,
  { email, passwordHash, now }: { email: string; passwordHash: string; now: Date },
) => {
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, activatedAt: now })
    .returning({ id: users.id });
  if (!user) throw new Error('load user not created');
  await db.insert(appSettings).values({ userId: user.id });
  return user.id;
};

/**
 * T-703: fills a database with fictitious, reproducible data — the ENF-PERF-01 volume for the main user (1 000
 * applications over 12 months, every status, their history, 10 000 messages, 20 sites and 5 000 offers), a tenth of
 * it for each other user — then refreshes the planner statistics. The same seed gives the same rows. Makes no
 * external call; the caller chooses the database (never Neon).
 * @returns the ids of the users filled, the main one first.
 * @req ENF-PERF-01, ENF-PERF-04, ENF-PERF-05
 */
export const seedLoadDataset = async (db: Database, options: LoadOptions): Promise<number[]> => {
  const { now, seed = DEFAULT_SEED, users: userCount = DEFAULT_USERS, mainUserId, passwordHash } = options;
  const random = randomFrom(seed);
  const userIds: number[] = [];
  for (let index = 0; index < Math.max(userCount, 1); index += 1) {
    const isMain = index === 0;
    const userId =
      isMain && mainUserId !== undefined
        ? mainUserId
        : await createUser(db, { email: `charge-${String(index + 1)}@example.test`, passwordHash, now });
    await fillUser({
      db,
      random,
      userId,
      now,
      load: isMain ? MAIN_USER_LOAD : OTHER_USER_LOAD,
      tag: `u${String(index + 1)}`,
    });
    userIds.push(userId);
  }
  // Fresh statistics and visibility map, as autovacuum leaves them on a database in use.
  await db.execute(sql`VACUUM ANALYZE`);
  return userIds;
};
