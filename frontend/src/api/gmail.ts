import { request } from './client';

/** Gmail connection of the user (schema `GmailStatus` in /api/docs, EF-CFG-01). */
export type GmailStatus =
  | { connected: false }
  | { connected: true; emailAddress: string; connectedAt: string; lastSyncAt: string | null };

export const fetchGmailStatus = (signal?: AbortSignal) => request<GmailStatus>('/gmail/status', { signal });

/** EF-GML-01: Google's consent page, carrying a single-use state. */
export const fetchGmailAuthorizationUrl = () => request<{ url: string }>('/gmail/authorization-url');

/** EF-GML-02: revokes the connection; no token remains. */
export const disconnectGmail = () => request<undefined>('/gmail/connection', { method: 'DELETE' });
