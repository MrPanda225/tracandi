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

export type EmailCategory = 'sent_application' | 'acknowledged' | 'interview' | 'offer' | 'rejected' | 'job_alert';

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

export interface ApplicationFilters {
  status?: ApplicationStatus;
  contractType?: ContractType;
  /** EF-CAN-03: company name or job title. */
  q?: string;
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

/** Fields changed from the list (EF-CAN-07, 15, 16); `null` clears the description. */
export interface ApplicationChanges {
  status?: ApplicationStatus;
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

/** EF-CAN-01, 02, 03, 14: one page of the user's applications, grouped by company by the API's sort order. */
export const fetchApplications = (
  filters: ApplicationFilters,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  request<ApplicationPage>(`/applications?${queryString({ ...filters, ...page })}`, { signal });

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
