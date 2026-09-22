import { request } from './client';

export type ApplicationStatus = 'to_apply' | 'sent' | 'acknowledged' | 'interview' | 'offer' | 'rejected';
export type ContractType = 'cdi' | 'cdd' | 'alternance' | 'job_etudiant' | 'autre' | 'non_precise';

/** Application waiting for a follow-up (RG-06). */
export interface FollowUp {
  id: number;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  lastActivityAt: string;
  daysSinceActivity: number;
}

/** Figures of `GET /api/stats/dashboard` (schema `Dashboard` in /api/docs). */
export interface Dashboard {
  totals: { applications: number; reachedInterview: number; responseRate: number };
  byStatus: { status: ApplicationStatus; count: number }[];
  byChannel: { direct: number; platform: number };
  byContractType: { contractType: ContractType; count: number; responseRate: number }[];
  weekly: { weekStart: string; sent: number; interviews: number; rejected: number }[];
  followUps: { total: number; items: FollowUp[] };
  offers: { newAboveThreshold: number; threshold: number };
  followUpDays: number;
}

/** EF-TDB-01 to 09: every dashboard figure of the signed-in user. */
export const fetchDashboard = (signal?: AbortSignal) => request<Dashboard>('/stats/dashboard', { signal });
