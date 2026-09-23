import { request } from './client';

/** Les six types de source de la veille (schéma `SourceType` dans /api/docs, EF-VEI-08). */
export type SourceAdapterId =
  | 'greenhouse'
  | 'lever'
  | 'smartrecruiters'
  | 'recruitee'
  | 'workday'
  | 'generic';

/** Un type de source, tel que l'API le décrit : l'écran ne tient pas la liste lui-même (ENF-MAI-03). */
export interface SourceType {
  id: SourceAdapterId;
  label: string;
  identifierHint: string;
}

/** Une source surveillée (schéma `Source` dans /api/docs, EF-VEI-01, EF-VEI-10, EF-VEI-11). */
export interface Source {
  id: number;
  companyName: string;
  adapter: SourceAdapterId;
  adapterLabel: string;
  identifier: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  offerCount: number;
}

export interface NewSource {
  companyName: string;
  adapter: SourceAdapterId;
  identifier: string;
}

/** EF-VEI-08 : les types pris en charge, avec ce qu'il faut saisir pour chacun (RG-08). */
export const fetchSourceTypes = (signal?: AbortSignal) =>
  request<{ items: SourceType[] }>('/sites/types', { signal }).then((answer) => answer.items);

/** EF-VEI-01 : les sources du candidat, par entreprise. */
export const fetchSources = (signal?: AbortSignal) =>
  request<{ items: Source[] }>('/sites', { signal }).then((answer) => answer.items);

/** EF-VEI-01 : ajoute une source ; 409 si elle est déjà surveillée (EF-VEI-03). */
export const addSource = (source: NewSource) => request<Source>('/sites', { method: 'POST', body: source });

/** EF-VEI-04 : suspend ou réactive une source. */
export const setSourceActive = (id: number, isActive: boolean) =>
  request<Source>(`/sites/${String(id)}`, { method: 'PATCH', body: { isActive } });

/** EF-VEI-05 : retire une source ; ses offres partent avec elle. */
export const removeSource = (id: number) => request<undefined>(`/sites/${String(id)}`, { method: 'DELETE' });

/**
 * EF-VEI-07 : met une consultation de toutes les sources actives en file d'attente.
 * @returns l'identifiant de l'exécution, à suivre par `followRuns` (EF-EXE-01).
 */
export const runWatch = () =>
  request<{ runId: number }>('/sites/run', { method: 'POST' }).then((answer) => answer.runId);
