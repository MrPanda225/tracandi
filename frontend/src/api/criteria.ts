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

/** RG-28 : le niveau d'expérience du candidat, tiré de ses années (schéma `WatchCriteria` dans /api/docs). */
export type ExperienceLevel = 'junior' | 'confirme' | 'senior';

export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['junior', 'confirme', 'senior'];

/** EF-VEI-29 : ce que le candidat recherche. Sans commune : toute la France. */
export interface WatchCriteria {
  targets: CriteriaTarget[];
  place: Place | null;
  radiusKm: number;
  acceptsRemote: boolean;
  romeCodes: string[];
  /** EF-VEI-47 : années d'expérience du profil validé ; absentes tant que seul le niveau est connu. */
  years?: number;
  level?: ExperienceLevel;
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

/**
 * EF-VEI-46, EF-VEI-47 : le profil que le candidat valide après l'avoir corrigé — de 1 à 5 offres types, et ses années
 * ou son niveau. Avec des années, l'API en tire le niveau (RG-28) et il l'emporte sur un niveau donné à côté : on
 * n'envoie donc que l'un des deux.
 */
export interface ProfileValidation {
  targets: CriteriaTarget[];
  years?: number;
  level?: ExperienceLevel;
}

/**
 * EF-VEI-46 : remplace les cibles, les années et le niveau des critères ; la commune, le rayon, le télétravail et les
 * codes ROME restent ceux du candidat. La valeur rendue est celle que l'API a retenue.
 */
export const validateProfile = (profile: ProfileValidation) =>
  request<{ criteria: WatchCriteria }>('/watch/criteria/validation', { method: 'POST', body: profile }).then(
    (answer) => answer.criteria,
  );
