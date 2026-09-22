import { request } from './client';

/** Gmail connection of the user (schema `GmailStatus` in /api/docs, EF-CFG-01). */
export type GmailStatus =
  | { connected: false }
  | {
      connected: true;
      emailAddress: string;
      connectedAt: string;
      lastSyncAt: string | null;
      /** EF-GML-17: false in read-only mode. */
      applyLabels: boolean;
      /** Q-11: Google refused the authorisation; Gmail must be connected again. */
      authorizationExpired: boolean;
    };

export const fetchGmailStatus = (signal?: AbortSignal) => request<GmailStatus>('/gmail/status', { signal });

/** EF-GML-01: Google's consent page, carrying a single-use state. */
export const fetchGmailAuthorizationUrl = () => request<{ url: string }>('/gmail/authorization-url');

/** EF-GML-02: revokes the connection; no token remains. */
export const disconnectGmail = () => request<undefined>('/gmail/connection', { method: 'DELETE' });

/** Counters of a synchronisation (schema `GmailSyncReport` in /api/docs, EF-GML-04). */
export interface SyncReport {
  read: number;
  retained: number;
  classified: number;
}

/** EF-GML-04: reads and classifies the new messages now. */
export const synchroniseGmail = () => request<SyncReport>('/gmail/sync', { method: 'POST' });

/** EF-GML-17: turns the writing of labels in Gmail on or off. */
export const setGmailApplyLabels = (applyLabels: boolean) =>
  request<undefined>('/gmail/settings', { method: 'PATCH', body: { applyLabels } });
