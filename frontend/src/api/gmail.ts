import { request } from './client';

/** Gmail connection of the user (schema `GmailStatus` in /api/docs, EF-CFG-01). */
export type GmailStatus =
  | { connected: false }
  | {
      connected: true;
      emailAddress: string;
      connectedAt: string;
      /** EF-CFG-01: fin de la dernière synchronisation réussie ; null si aucune. */
      lastRunAt: string | null;
      /** EF-GML-06 : date jusqu'à laquelle tout est traité ; null avec `lastRunAt` = rattrapage en cours. */
      lastSyncAt: string | null;
      /** EF-GML-17: false in read-only mode. */
      applyLabels: boolean;
      /** EF-CFG-04: period of the first synchronisation, in days (N of EF-GML-05). */
      lookbackDays: number;
      /** Q-11: Google refused the authorisation; Gmail must be connected again. */
      authorizationExpired: boolean;
    };

export const fetchGmailStatus = (signal?: AbortSignal) => request<GmailStatus>('/gmail/status', { signal });

/** EF-GML-01: Google's consent page, carrying a single-use state. */
export const fetchGmailAuthorizationUrl = () => request<{ url: string }>('/gmail/authorization-url');

/** EF-GML-02: revokes the connection; no token remains. */
export const disconnectGmail = () => request<undefined>('/gmail/connection', { method: 'DELETE' });

/** EF-EXE-01 : la passe est mise en file ; son avancement se suit par `/jobs` (EF-EXE-03). */
export const synchroniseGmail = () =>
  request<{ runId: number }>('/gmail/sync', { method: 'POST' });

/** EF-GML-20 : met en file la relecture des accusés de réception déjà classés ; suivie par `/jobs` (EF-EXE-03). */
export const reclassifyGmail = () => request<{ runId: number }>('/gmail/reclassify', { method: 'POST' });

/** EF-GML-17: turns the writing of labels in Gmail on or off. */
export const setGmailApplyLabels = (applyLabels: boolean) =>
  request<undefined>('/gmail/settings', { method: 'PATCH', body: { applyLabels } });

/** EF-CFG-04: period of the first synchronisation, in days. */
export const setGmailLookbackDays = (lookbackDays: number) =>
  request<undefined>('/gmail/settings', { method: 'PATCH', body: { lookbackDays } });
