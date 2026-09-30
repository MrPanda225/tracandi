import { request } from './client';
import type { ApplicationStatus, ContractType } from './stats';

/** One application, as returned by `GET /api/applications` (schema `Application` in /api/docs). */
export interface Application {
  id: number;
  company: { id: number; name: string };
  jobTitle: string;
  contractType: ContractType;
  status: ApplicationStatus;
  source: 'email' | 'offer' | 'manual';
  platform: string | null;
  notes: string | null;
  appliedAt: string;
  lastActivityAt: string;
  /** RG-06, EF-CAN-12 */
  isFollowUpDue: boolean;
}

/** EF-CAN-15: same bound as the API. */
export const OFFER_DESCRIPTION_MAX_LENGTH = 20000;

/** One application with the description of its offer (`GET /api/applications/:id`, EF-CAN-15). */
export interface ApplicationDetail extends Application {
  offerDescription: string | null;
}

export type EmailCategory =
  'sent_application' | 'acknowledged' | 'interview' | 'offer' | 'rejected' | 'job_alert';

/** One message of an application's chronology (schema `Email` in /api/docs). */
export interface ApplicationEmail {
  id: number;
  direction: 'inbound' | 'outbound';
  category: EmailCategory;
  fromAddress: string | null;
  subject: string | null;
  snippet: string | null;
  platform: string | null;
  receivedAt: string;
  gmailUrl: string;
}

/** EF-CAN-20: the orders offered on screen, each one a sort and a direction of the API. */
export const APPLICATION_ORDERS = {
  recent: { sort: 'applied_at', order: 'desc', label: 'Plus récentes d’abord' },
  oldest: { sort: 'applied_at', order: 'asc', label: 'Plus anciennes d’abord' },
  activity: { sort: 'last_activity', order: 'desc', label: 'Dernière activité' },
  status: { sort: 'status', order: 'desc', label: 'Statut' },
  company: { sort: 'company', order: 'asc', label: 'Entreprise (A → Z)' },
} as const;
export type ApplicationOrder = keyof typeof APPLICATION_ORDERS;
/** EF-CAN-20: the most recent application first, unless the candidate chose otherwise. */
export const DEFAULT_ORDER: ApplicationOrder = 'recent';

export interface ApplicationFilters {
  status?: ApplicationStatus;
  contractType?: ContractType;
  /** EF-CAN-03: company name or job title. */
  q?: string;
  /** EF-CAN-20 */
  orderBy?: ApplicationOrder;
  /** EF-CAN-24: Paris days « YYYY-MM-DD », both included. */
  appliedFrom?: string;
  appliedTo?: string;
}

export interface ApplicationPage {
  items: Application[];
  total: number;
}

export interface NewApplication {
  companyName: string;
  jobTitle: string;
  status: ApplicationStatus;
  contractType: ContractType;
  /** EF-CAN-16: ISO instant; the API dates the application now when absent. */
  appliedAt?: string;
  /** EF-CAN-15 */
  offerDescription?: string;
}

/** EF-CAN-08: same bound as the API. */
export const NOTES_MAX_LENGTH = 2000;

/** Fields changed from the list (EF-CAN-07, 08, 13, 15, 16); `null` clears the description or the notes. */
export interface ApplicationChanges {
  status?: ApplicationStatus;
  contractType?: ContractType;
  notes?: string | null;
  appliedAt?: string;
  offerDescription?: string | null;
}

const queryString = (values: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
};

const queryOf = (
  { orderBy = DEFAULT_ORDER, ...filters }: ApplicationFilters,
  page: { limit: number; offset: number },
) => {
  const { sort, order } = APPLICATION_ORDERS[orderBy];
  return { ...filters, sort, order, ...page };
};

/** EF-CAN-01, 02, 03, 14, 20, 24: one page of the user's applications, in the order chosen. */
export const fetchApplications = (
  filters: ApplicationFilters,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) => request<ApplicationPage>(`/applications?${queryString(queryOf(filters, page))}`, { signal });

/** One application with its offer description, and its follow-up flag recomputed (RG-06). */
export const fetchApplication = (id: number, signal?: AbortSignal) =>
  request<ApplicationDetail>(`/applications/${id}`, { signal });

/** EF-CAN-04: messages of an application, oldest first. */
export const fetchApplicationEmails = (id: number, signal?: AbortSignal) =>
  request<ApplicationEmail[]>(`/applications/${id}/emails`, { signal });

/** EF-CAN-06: resolves with the id of the new application. */
export const createApplication = (application: NewApplication) =>
  request<{ id: number }>('/applications', { method: 'POST', body: application });

/** EF-CAN-07, EF-CAN-15, EF-CAN-16: only the given fields change. */
export const updateApplication = (id: number, changes: ApplicationChanges) =>
  request<undefined>(`/applications/${id}`, { method: 'PATCH', body: changes });

/** EF-CAN-09: deletes the application; its messages stay stored, detached from it. */
export const deleteApplication = (id: number) =>
  request<undefined>(`/applications/${id}`, { method: 'DELETE' });

/** EF-CAN-17: a follow-up saved as a Gmail draft (schema `FollowUpDraft` in /api/docs); nothing is sent. */
export interface FollowUpDraft {
  draftUrl: string;
  to: string;
  subject: string;
}

/** EF-CAN-17: has the follow-up of an application written and saved as a draft in its Gmail thread. */
export const prepareFollowUpDraft = (id: number) =>
  request<FollowUpDraft>(`/applications/${id}/follow-up-draft`, { method: 'POST' });
