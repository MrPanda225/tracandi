import { request } from './client';

/** Les types de source de la veille (schéma `SourceType` dans /api/docs, EF-VEI-08). */
export type SourceAdapterId =
  | 'greenhouse'
  | 'lever'
  | 'smartrecruiters'
  | 'recruitee'
  | 'workday'
  | 'generic'
  | 'france_travail';

/** Un type de source, tel que l'API le décrit : l'écran ne tient pas la liste lui-même (ENF-MAI-03). */
export interface SourceType {
  id: SourceAdapterId;
  label: string;
  identifierHint: string;
  /** EF-VEI-32 : une source officielle, sans entreprise, interrogée selon les critères de recherche. */
  isOfficial: boolean;
}

/** Une source surveillée (schéma `Source` dans /api/docs, EF-VEI-01, EF-VEI-10, EF-VEI-11). */
export interface Source {
  id: number;
  /** Null pour une source officielle (EF-VEI-32), nommée par son type. */
  companyName: string | null;
  adapter: SourceAdapterId;
  adapterLabel: string;
  identifier: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  offerCount: number;
}

export interface NewSource {
  /** Absent pour une source officielle, qui n'a pas d'entreprise (EF-VEI-32). */
  companyName?: string;
  adapter: SourceAdapterId;
  identifier: string;
}

/**
 * EF-VEI-23, EF-VEI-24 : une source proposée, déduite d'une entreprise à laquelle le candidat a déjà postulé.
 * Elle n'est jamais ajoutée d'office : l'écran la pré-remplit, le candidat confirme ou l'écarte (RG-19).
 */
export interface SourceSuggestion {
  companyId: number;
  companyName: string;
  domain: string;
  adapter: SourceAdapterId;
  identifier: string;
  messages: number;
}

/** EF-VEI-23 : les sources que le candidat pourrait surveiller, déduites de ses candidatures. */
export const fetchSuggestions = (signal?: AbortSignal) =>
  request<{ items: SourceSuggestion[] }>('/sites/suggestions', { signal }).then((answer) => answer.items);

/** EF-VEI-25 : écarte une proposition, qui n'est plus présentée. */
export const dismissSuggestion = (companyId: number) =>
  request<undefined>(`/sites/suggestions/${String(companyId)}/dismiss`, { method: 'POST' });

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
