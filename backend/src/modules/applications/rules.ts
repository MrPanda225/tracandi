import type { applicationStatus, emailCategory } from '../../db/schema.js';
import { normalizeKey } from '../../lib/text.js';

export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type EmailCategory = (typeof emailCategory.enumValues)[number];

// RG-04: rank of each status.
const STATUS_RANK: Record<ApplicationStatus, number> = {
  to_apply: 0,
  sent: 1,
  acknowledged: 2,
  interview: 3,
  offer: 4,
  rejected: 5,
};
const ALWAYS_REPLACING: ReadonlySet<ApplicationStatus> = new Set(['offer', 'rejected']);

// RG-02: message category → application status; a job alert changes nothing.
const STATUS_OF_CATEGORY: Record<EmailCategory, ApplicationStatus | null> = {
  sent_application: 'sent',
  acknowledged: 'acknowledged',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
  job_alert: null,
};

// RG-06
const FOLLOW_UP_STATUSES: ReadonlySet<ApplicationStatus> = new Set(['sent', 'acknowledged']);
const DAY_MS = 24 * 60 * 60 * 1000;

// RG-03
export const UNKNOWN_COMPANY = 'Entreprise inconnue';
export const DEFAULT_JOB_TITLE = 'Candidature';

/**
 * RG-04: an incoming status replaces the current one if and only if it is Proposition or Refusée,
 * or its rank is higher. A late acknowledgement never downgrades an interview.
 * @req RG-04, EF-CAN-11
 */
export const shouldReplaceStatus = (current: ApplicationStatus, incoming: ApplicationStatus): boolean =>
  ALWAYS_REPLACING.has(incoming) || STATUS_RANK[incoming] > STATUS_RANK[current];

/**
 * RG-02: status implied by a message category, or null for a category that changes no application.
 * @req RG-02
 */
export const statusOfCategory = (category: EmailCategory): ApplicationStatus | null =>
  STATUS_OF_CATEGORY[category];

/**
 * RG-06: true when the application is Envoyée or Accusé reçu and its last activity is more than `followUpDays`
 * days before `now` (strictly).
 * @req RG-06, EF-CAN-12
 */
export const isFollowUpDue = (
  application: { status: ApplicationStatus; lastActivityAt: Date },
  now: Date,
  followUpDays: number,
): boolean =>
  FOLLOW_UP_STATUSES.has(application.status) &&
  now.getTime() - application.lastActivityAt.getTime() > followUpDays * DAY_MS;

/**
 * RG-03 company: the real employer when identified, otherwise the intermediary platform, otherwise
 * « Entreprise inconnue ».
 * @req RG-03
 */
export const resolveCompanyName = (message: { employer: string | null; platform: string | null }): string =>
  message.employer?.trim() || message.platform?.trim() || UNKNOWN_COMPANY;

/** Outcome of RG-03 for a message of a known company. */
export type AttachmentDecision =
  { kind: 'existing'; applicationId: number } | { kind: 'new'; jobTitle: string };

/**
 * RG-03 (b, c, d): among the applications of the message's company, picks the one the message belongs to.
 * (b) job title mentioned → the application with the same normalized title, else a new one with that title;
 * (c) no title → the application with the most recent activity; (d) none → a new « Candidature ».
 * @req RG-03, EF-GML-11, EF-GML-12
 */
export const decideAttachment = (
  mentionedJobTitle: string | null,
  companyApplications: readonly { id: number; jobTitleKey: string; lastActivityAt: Date }[],
): AttachmentDecision => {
  const titleKey = mentionedJobTitle ? normalizeKey(mentionedJobTitle) : '';
  if (mentionedJobTitle && titleKey) {
    const sameTitle = companyApplications.find((application) => application.jobTitleKey === titleKey);
    return sameTitle
      ? { kind: 'existing', applicationId: sameTitle.id }
      : { kind: 'new', jobTitle: mentionedJobTitle.trim() };
  }
  const mostRecent = [...companyApplications].sort(
    (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
  )[0];
  return mostRecent
    ? { kind: 'existing', applicationId: mostRecent.id }
    : { kind: 'new', jobTitle: DEFAULT_JOB_TITLE };
};

/**
 * RG-04: the last activity date is the later of the current one and the message date.
 * @req RG-04
 */
export const laterOf = (current: Date, candidate: Date): Date => (candidate > current ? candidate : current);
