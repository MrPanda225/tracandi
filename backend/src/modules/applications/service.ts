import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { HttpError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { normalizeKey } from '../../lib/text.js';
import * as repository from './repository.js';
import type { ApplicationRow, EmailRow, Executor } from './repository.js';
import {
  type ApplicationStatus,
  type ContractType,
  decideAttachment,
  type EmailCategory,
  isFollowUpDue,
  lastActivityAfterDateChange,
  laterOf,
  resolveCompanyName,
  shouldReplaceStatus,
  statusOfCategory,
} from './rules.js';
import type {
  ApplicationDetailView,
  ApplicationView,
  CreateApplicationBody,
  EmailView,
  ListApplicationsQuery,
  UpdateApplicationBody,
} from './schemas.js';

// RG-06 default D, used if the settings row is missing.
const DEFAULT_FOLLOW_UP_DAYS = 10;
const GMAIL_THREAD_URL = 'https://mail.google.com/mail/u/0/#all/';
const DUPLICATE_APPLICATION = 'Une candidature existe déjà pour ce poste dans cette entreprise';
const APPLICATION_NOT_FOUND = 'Candidature introuvable';
// EF-CAN-16: a date sent as « now » by a browser whose clock runs slightly ahead is still accepted.
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;

/** EF-CAN-16: an application date cannot be in the future. */
const assertNotFuture = (appliedAt: Date, now: Date): void => {
  if (appliedAt.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    throw new ValidationError([
      { path: 'body.appliedAt', message: 'La date de candidature ne peut pas être dans le futur' },
    ]);
  }
};

/** Application and message use cases, always scoped to one user (EF-AUT-06). */
export interface ApplicationsService {
  list(userId: number, query: ListApplicationsQuery): Promise<{ items: ApplicationView[]; total: number }>;
  get(userId: number, id: number): Promise<ApplicationDetailView>;
  create(userId: number, body: CreateApplicationBody): Promise<number>;
  update(userId: number, id: number, body: UpdateApplicationBody): Promise<void>;
  remove(userId: number, id: number): Promise<void>;
  listEmails(userId: number, applicationId: number): Promise<EmailView[]>;
  reattachEmail(userId: number, emailId: number, applicationId: number | null): Promise<void>;
}

interface ApplicationsServiceDeps {
  db: Database;
  clock: Clock;
}

const toView = (row: ApplicationRow, now: Date, followUpDays: number): ApplicationView => ({
  id: row.id,
  company: { id: row.companyId, name: row.companyName },
  jobTitle: row.jobTitle,
  contractType: row.contractType,
  status: row.status,
  source: row.source,
  platform: row.platformName,
  notes: row.notes,
  appliedAt: row.appliedAt,
  lastActivityAt: row.lastActivityAt,
  isFollowUpDue: isFollowUpDue(row, now, followUpDays),
});

const toEmailView = (row: EmailRow): EmailView => ({
  id: row.id,
  direction: row.direction,
  category: row.category,
  fromAddress: row.fromAddress,
  subject: row.subject,
  snippet: row.snippet,
  platform: row.platformName,
  receivedAt: row.receivedAt,
  gmailUrl: `${GMAIL_THREAD_URL}${encodeURIComponent(row.gmailThreadId)}`,
});

const rethrowDuplicate = (error: unknown): never => {
  if (isUniqueViolation(error)) throw new HttpError(409, DUPLICATE_APPLICATION);
  throw error;
};

/**
 * RG-02 + RG-04 applied to an application when a message is attached to it: status upgraded only when RG-04 allows
 * it (history recorded with origin `email`), last activity set to the later date.
 * @req EF-CAN-11, RG-02, RG-04
 */
const applyAttachedMessage = async (
  tx: Executor,
  application: ApplicationRow,
  email: Pick<EmailRow, 'id' | 'category' | 'receivedAt'>,
): Promise<void> => {
  const incoming = statusOfCategory(email.category);
  const isStatusChange = incoming !== null && shouldReplaceStatus(application.status, incoming);
  if (isStatusChange) {
    await repository.insertStatusChange(tx, {
      applicationId: application.id,
      status: incoming,
      changedAt: email.receivedAt,
      origin: 'email',
      emailId: email.id,
    });
  }
  await repository.updateApplication(tx, application.id, {
    ...(isStatusChange ? { status: incoming } : {}),
    lastActivityAt: laterOf(application.lastActivityAt, email.receivedAt),
  });
};

const findOwned = async (executor: Executor, userId: number, id: number): Promise<ApplicationRow> => {
  const row = await repository.findApplication(executor, userId, id);
  if (!row) throw new NotFoundError(APPLICATION_NOT_FOUND);
  return row;
};

/**
 * EF-CAN-06: company upserted (RG-14), application and initial status recorded in one transaction. The application
 * date is the one given, or now (EF-CAN-16); last activity and initial status share it (RG-16).
 */
const createApplication = (
  tx: Executor,
  { userId, body, now }: { userId: number; body: CreateApplicationBody; now: Date },
): Promise<number> => {
  const appliedAt = body.appliedAt ?? now;
  assertNotFuture(appliedAt, now);
  return repository
    .upsertCompany(tx, { userId, name: body.companyName, nameKey: normalizeKey(body.companyName) })
    .then(async (companyId) => {
      const id = await repository.insertApplication(tx, {
        companyId,
        jobTitle: body.jobTitle,
        jobTitleKey: normalizeKey(body.jobTitle),
        status: body.status,
        contractType: body.contractType,
        source: 'manual',
        notes: body.notes ?? null,
        offerDescription: body.offerDescription ?? null,
        appliedAt,
        lastActivityAt: appliedAt,
      });
      await repository.insertStatusChange(tx, {
        applicationId: id,
        status: body.status,
        changedAt: appliedAt,
        origin: 'manual',
      });
      return id;
    });
};

/** Columns set by an update body: only the provided fields (`null` clears notes and description). */
const changedColumnsOf = (body: UpdateApplicationBody) => ({
  ...(body.status ? { status: body.status } : {}),
  ...(body.contractType ? { contractType: body.contractType } : {}),
  ...(body.jobTitle ? { jobTitle: body.jobTitle, jobTitleKey: normalizeKey(body.jobTitle) } : {}),
  ...(body.notes !== undefined ? { notes: body.notes } : {}),
  ...(body.offerDescription !== undefined ? { offerDescription: body.offerDescription } : {}),
  ...(body.appliedAt ? { appliedAt: body.appliedAt } : {}),
});

/** Last activity after an update: a status change is activity now; a new application date follows RG-16. */
const lastActivityAfterUpdate = (
  current: ApplicationRow,
  { isStatusChange, appliedAt, now }: { isStatusChange: boolean; appliedAt: Date | undefined; now: Date },
): Date | undefined => {
  if (isStatusChange) return now;
  return appliedAt ? lastActivityAfterDateChange(current, appliedAt) : undefined;
};

/**
 * EF-CAN-07, EF-CAN-08, EF-CAN-13, EF-CAN-15, EF-CAN-16: only the provided fields change. A manual status change
 * accepts any status (Q-07 default), is recorded in the history and counts as activity.
 */
const updateApplication = async (
  tx: Executor,
  current: ApplicationRow,
  { body, now }: { body: UpdateApplicationBody; now: Date },
): Promise<void> => {
  if (body.appliedAt) assertNotFuture(body.appliedAt, now);
  const newStatus = body.status !== undefined && body.status !== current.status ? body.status : null;
  if (newStatus) {
    await repository.insertStatusChange(tx, {
      applicationId: current.id,
      status: newStatus,
      changedAt: now,
      origin: 'manual',
    });
  }
  const lastActivityAt = lastActivityAfterUpdate(current, {
    isStatusChange: newStatus !== null,
    appliedAt: body.appliedAt,
    now,
  });
  await repository.updateApplication(tx, current.id, {
    ...changedColumnsOf(body),
    ...(lastActivityAt ? { lastActivityAt } : {}),
  });
};

/** EF-CAN-10: moves one of the user's messages to one of the user's applications, or detaches it (null). */
const reattachEmail = async (
  tx: Executor,
  userId: number,
  move: { emailId: number; applicationId: number | null },
): Promise<void> => {
  const email = await repository.findEmail(tx, userId, move.emailId);
  if (!email) throw new NotFoundError('Message introuvable');
  const target = move.applicationId === null ? null : await findOwned(tx, userId, move.applicationId);
  await repository.setEmailApplication(tx, move.emailId, move.applicationId);
  if (target) await applyAttachedMessage(tx, target, email);
};

/** A classified message, already stored as `emailId`, to attach to an application of its user. */
export interface IncomingMessage {
  userId: number;
  emailId: number;
  /** A category that implies a status (RG-02): never a job alert. */
  category: EmailCategory;
  receivedAt: Date;
  employer: string | null;
  platform: { id: number; name: string } | null;
  jobTitle: string | null;
  /** EF-GML-19: the contract type the message mentions, or null. */
  contractType: ContractType | null;
}

/** EF-GML-12: application created from a message, at the status and date of that message. */
const createFromMessage = async (
  tx: Executor,
  message: IncomingMessage,
  { companyId, jobTitle, status }: { companyId: number; jobTitle: string; status: ApplicationStatus },
): Promise<number> => {
  const id = await repository.insertApplication(tx, {
    companyId,
    jobTitle,
    jobTitleKey: normalizeKey(jobTitle),
    status,
    contractType: message.contractType ?? 'non_precise',
    source: 'email',
    platformId: message.platform?.id ?? null,
    appliedAt: message.receivedAt,
    lastActivityAt: message.receivedAt,
  });
  await repository.insertStatusChange(tx, {
    applicationId: id,
    status,
    changedAt: message.receivedAt,
    origin: 'email',
    emailId: message.emailId,
  });
  return id;
};

/**
 * RG-03: attaches a message to the application of its company it belongs to, or to a new one (EF-GML-12), then
 * applies RG-02 and RG-04. Runs in the caller's transaction, so that the message and its effect are stored together.
 * @returns the id of the application.
 * @throws Error for a job alert, which belongs to no application (RG-02).
 * @req RG-03, RG-04, EF-GML-11, EF-GML-12, EF-GML-19, EF-CAN-11
 */
export const attachIncomingMessage = async (tx: Executor, message: IncomingMessage): Promise<number> => {
  const status = statusOfCategory(message.category);
  if (!status) throw new Error('a job alert belongs to no application');
  const companyName = resolveCompanyName({
    employer: message.employer,
    platform: message.platform?.name ?? null,
  });
  const companyId = await repository.upsertCompany(tx, {
    userId: message.userId,
    name: companyName,
    nameKey: normalizeKey(companyName),
  });
  const decision = decideAttachment(
    message.jobTitle,
    await repository.listCompanyApplications(tx, companyId),
  );
  const applicationId =
    decision.kind === 'existing'
      ? decision.applicationId
      : await createFromMessage(tx, message, { companyId, jobTitle: decision.jobTitle, status });
  await repository.setEmailApplication(tx, message.emailId, applicationId);
  if (decision.kind === 'existing') {
    const application = await findOwned(tx, message.userId, applicationId);
    await applyAttachedMessage(tx, application, {
      id: message.emailId,
      category: message.category,
      receivedAt: message.receivedAt,
    });
  }
  return applicationId;
};

/** An application as its Gmail labels show it: company, status and every attached thread (RG-05). */
export interface ApplicationThreads {
  companyName: string;
  status: ApplicationStatus;
  threadIds: string[];
}

/**
 * The threads of these applications of the user, grouped by application, for their Gmail labels.
 * @req EF-GML-13, EF-GML-14, EF-AUT-06
 */
export const findApplicationThreads = async (
  db: Executor,
  userId: number,
  applicationIds: readonly number[],
): Promise<ApplicationThreads[]> => {
  const byApplication = new Map<number, ApplicationThreads>();
  for (const row of await repository.listApplicationThreads(db, userId, applicationIds)) {
    const group = byApplication.get(row.applicationId) ?? {
      companyName: row.companyName,
      status: row.status,
      threadIds: [],
    };
    group.threadIds.push(row.gmailThreadId);
    byApplication.set(row.applicationId, group);
  }
  return [...byApplication.values()];
};

/**
 * Creates the applications service. Every operation is scoped to the given user (EF-AUT-06);
 * writes run in a transaction; a duplicate (company, job title) becomes a 409.
 * @req EF-CAN-01 to EF-CAN-14, EF-AUT-06
 */
export const createApplicationsService = ({ db, clock }: ApplicationsServiceDeps): ApplicationsService => {
  const followUpDaysOf = async (userId: number) =>
    (await repository.getFollowUpDays(db, userId)) ?? DEFAULT_FOLLOW_UP_DAYS;

  return {
    async list(userId, query) {
      const [result, followUpDays] = await Promise.all([
        repository.listApplications(db, userId, { ...query, searchKey: normalizeKey(query.q ?? '') }),
        followUpDaysOf(userId),
      ]);
      const now = clock();
      return { items: result.rows.map((row) => toView(row, now, followUpDays)), total: result.total };
    },

    async get(userId, id) {
      const [row, followUpDays] = await Promise.all([
        repository.findApplicationDetail(db, userId, id),
        followUpDaysOf(userId),
      ]);
      if (!row) throw new NotFoundError(APPLICATION_NOT_FOUND);
      return { ...toView(row, clock(), followUpDays), offerDescription: row.offerDescription };
    },

    create(userId, body) {
      return db
        .transaction((tx) => createApplication(tx, { userId, body, now: clock() }))
        .catch(rethrowDuplicate);
    },

    update(userId, id, body) {
      return db
        .transaction(async (tx) =>
          updateApplication(tx, await findOwned(tx, userId, id), { body, now: clock() }),
        )
        .catch(rethrowDuplicate);
    },

    async remove(userId, id) {
      if (!(await repository.deleteApplication(db, userId, id)))
        throw new NotFoundError(APPLICATION_NOT_FOUND);
    },

    async listEmails(userId, applicationId) {
      await findOwned(db, userId, applicationId);
      return (await repository.listEmailsOfApplication(db, applicationId)).map(toEmailView);
    },

    reattachEmail(userId, emailId, applicationId) {
      return db.transaction((tx) => reattachEmail(tx, userId, { emailId, applicationId }));
    },
  };
};
