import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { normalizeKey } from '../../lib/text.js';
import * as repository from './repository.js';
import type { ApplicationRow, EmailRow, Executor } from './repository.js';
import { isFollowUpDue, laterOf, shouldReplaceStatus, statusOfCategory } from './rules.js';
import type {
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

/** Application and message use cases, always scoped to one user (EF-AUT-06). */
export interface ApplicationsService {
  list(userId: number, query: ListApplicationsQuery): Promise<{ items: ApplicationView[]; total: number }>;
  get(userId: number, id: number): Promise<ApplicationView>;
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
  email: EmailRow,
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

/** EF-CAN-06: company upserted (RG-14), application and initial status recorded in one transaction. */
const createApplication = (
  tx: Executor,
  { userId, body, now }: { userId: number; body: CreateApplicationBody; now: Date },
): Promise<number> =>
  repository
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
        appliedAt: now,
        lastActivityAt: now,
      });
      await repository.insertStatusChange(tx, { applicationId: id, status: body.status, changedAt: now, origin: 'manual' });
      return id;
    });

/**
 * EF-CAN-07, EF-CAN-08, EF-CAN-13: only the provided fields change. A manual status change accepts any status
 * (Q-07 default), is recorded in the history and counts as activity.
 */
const updateApplication = async (
  tx: Executor,
  current: ApplicationRow,
  { body, now }: { body: UpdateApplicationBody; now: Date },
): Promise<void> => {
  const newStatus = body.status !== undefined && body.status !== current.status ? body.status : null;
  if (newStatus) {
    await repository.insertStatusChange(tx, { applicationId: current.id, status: newStatus, changedAt: now, origin: 'manual' });
  }
  await repository.updateApplication(tx, current.id, {
    ...(body.status ? { status: body.status } : {}),
    ...(body.contractType ? { contractType: body.contractType } : {}),
    ...(body.jobTitle ? { jobTitle: body.jobTitle, jobTitleKey: normalizeKey(body.jobTitle) } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(newStatus ? { lastActivityAt: now } : {}),
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
      const [row, followUpDays] = await Promise.all([findOwned(db, userId, id), followUpDaysOf(userId)]);
      return toView(row, clock(), followUpDays);
    },

    create(userId, body) {
      return db.transaction((tx) => createApplication(tx, { userId, body, now: clock() })).catch(rethrowDuplicate);
    },

    update(userId, id, body) {
      return db
        .transaction(async (tx) => updateApplication(tx, await findOwned(tx, userId, id), { body, now: clock() }))
        .catch(rethrowDuplicate);
    },

    async remove(userId, id) {
      if (!(await repository.deleteApplication(db, userId, id))) throw new NotFoundError(APPLICATION_NOT_FOUND);
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
