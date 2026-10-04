import { request } from './client';

/** RG-09 : les contrats qu'une cible peut accepter (schéma `WatchCriteria` dans /api/docs). */
export type CriteriaContractType = 'cdi' | 'cdd' | 'alternance' | 'job_etudiant';

export const CRITERIA_CONTRACT_TYPES: readonly CriteriaContractType[] = [
  'cdi',
  'cdd',
  'alternance',
  'job_etudiant',
];

/** EF-VEI-29 : un métier recherché, ses mots-clés et les contrats qu'il accepte. */
export interface CriteriaTarget {
  label: string;
  keywords: string[];
  contractTypes: CriteriaContractType[];
}

/** EF-VEI-30 : une commune, telle que le service public la décrit. */
export interface Place {
  code: string;
  name: string;
  departmentCode: string;
  latitude: number;
  longitude: number;
}

/** EF-VEI-29 : ce que le candidat recherche. Sans commune : toute la France. */
export interface WatchCriteria {
  targets: CriteriaTarget[];
  place: Place | null;
  radiusKm: number;
  acceptsRemote: boolean;
  romeCodes: string[];
}

/** Les critères enregistrés, ou null tant que le candidat n'en a aucun. */
export const fetchCriteria = (signal?: AbortSignal) =>
  request<{ criteria: WatchCriteria | null }>('/watch/criteria', { signal }).then(
    (answer) => answer.criteria,
  );

/** EF-VEI-29 : remplace les critères ; la valeur rendue est celle que l'API a retenue. */
export const saveCriteria = (criteria: WatchCriteria) =>
  request<{ criteria: WatchCriteria }>('/watch/criteria', { method: 'PUT', body: criteria }).then(
    (answer) => answer.criteria,
  );

/** EF-VEI-30 : les communes dont le nom commence comme le texte saisi. */
export const findPlaces = (query: string, signal?: AbortSignal) =>
  request<{ items: Place[] }>(`/watch/places?q=${encodeURIComponent(query)}`, { signal }).then(
    (answer) => answer.items,
  );
