import { request } from './client';
import type { CriteriaTarget, ExperienceLevel } from './criteria';

/** EF-CVX-39 : longueur maximale du libellé d'un CV type, contrôlée aussi par l'API. */
export const CV_TYPE_LABEL_MAX_LENGTH = 80;

/** EF-CVX-39 : l'écran invite le candidat à fournir trois ou quatre CV types. */
export const CV_TYPES_RECOMMENDED = 3;

/** Ce qui est gardé d'un CV type, et rien d'autre : ni le fichier ni son texte (schéma `CvType` dans /api/docs). */
export interface CvType {
  id: number;
  label: string;
  /** EF-VEI-43 : comptées par le code d'après les périodes du CV. */
  years: number | null;
  level: ExperienceLevel | null;
  /** EF-VEI-46 : le profil déduit attend la validation du candidat (gardé 30 minutes en mémoire). */
  deductionReady: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CvTypeList {
  items: CvType[];
  maxItems: number;
}

/** EF-VEI-45 : une offre type proposée d'après un CV, au format des cibles, avec son niveau. */
export interface DeducedTarget extends CriteriaTarget {
  level: ExperienceLevel;
}

/** EF-VEI-43, EF-VEI-45 : ce que l'on a déduit d'un CV type, à corriger puis valider (schéma `ProfileDeduction`). */
export interface ProfileDeduction {
  years: number;
  level: ExperienceLevel;
  targets: DeducedTarget[];
}

/** EF-CVX-39 : les CV types du candidat, au plus `maxItems`. */
export const fetchCvTypes = (signal?: AbortSignal) => request<CvTypeList>('/cv-types', { signal });

/**
 * EF-CVX-39, EF-CVX-43 : met en file la lecture du CV (PDF en base64) puis la déduction du profil ; rend aussitôt
 * l'identifiant de l'exécution. 409 au-delà de 4 CV types, 413 au-delà de 5 Mo, 429 au-delà du plafond du jour.
 */
export const importCvType = (label: string, fileBase64: string) =>
  request<{ runId: number }>('/cv-types', { method: 'POST', body: { label, file: fileBase64 } });

/** EF-CVX-41 : le nouveau fichier d'un CV type, lu et déduit dans la file ; l'ancien profil est effacé à la fin. */
export const replaceCvType = (id: number, fileBase64: string) =>
  request<{ runId: number }>(`/cv-types/${String(id)}`, { method: 'PUT', body: { file: fileBase64 } });

/** EF-CVX-42 : supprime le CV type et le profil qui en avait été déduit ; les critères déjà validés restent. */
export const deleteCvType = (id: number) =>
  request<undefined>(`/cv-types/${String(id)}`, { method: 'DELETE' });

/** EF-VEI-45 : le profil déduit d'un CV type ; 404, avec son message, une fois effacé (30 minutes). */
export const fetchDeduction = (id: number, signal?: AbortSignal) =>
  request<ProfileDeduction>(`/cv-types/${String(id)}/deduction`, { signal });
