import { request } from './client';
import type { ExperienceLevel } from './criteria';

/** EF-VEI-48 : offres choisies par niveau, et bornes du texte collé — contrôlées aussi par l'API. */
export const CHOSEN_OFFERS_PER_LEVEL = 3;
export const CHOSEN_OFFER_TEXT_MIN_LENGTH = 200;
export const CHOSEN_OFFER_TEXT_MAX_LENGTH = 20_000;

/** EF-VEI-49 : ce que l'on garde d'une offre choisie — ses traits, jamais son texte (schéma `ChosenOffer`). */
export interface ChosenOffer {
  id: number;
  /** Le niveau pour lequel le candidat l'a choisie. */
  level: ExperienceLevel;
  title: string;
  keywords: string[];
  /** RG-29 : les années que l'offre exige, lues par le code ; null quand elle n'en dit rien. */
  years: number | null;
  /** RG-28 : le niveau que ses traits indiquent ; null quand ni les années ni l'intitulé ne le disent. */
  suggestedLevel: ExperienceLevel | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChosenOfferList {
  items: ChosenOffer[];
  maxPerLevel: number;
}

/** EF-VEI-49 : les traits que le candidat corrige ; `years: null` dit que l'offre n'en exige pas. */
export interface ChosenOfferCorrection {
  title?: string;
  keywords?: string[];
  years?: number | null;
  level?: ExperienceLevel;
}

/** EF-VEI-48 : les offres choisies du candidat, avec leurs traits. */
export const fetchChosenOffers = (signal?: AbortSignal) =>
  request<ChosenOfferList>('/chosen-offers', { signal });

/**
 * EF-VEI-48, EF-VEI-49 : met en file la lecture du texte de l'offre ; rend aussitôt l'identifiant de l'exécution.
 * Le texte n'est conservé nulle part. 409 quand le niveau compte déjà 3 offres, 429 au-delà du plafond du jour.
 */
export const chooseOffer = (level: ExperienceLevel, text: string) =>
  request<{ runId: number }>('/chosen-offers', { method: 'POST', body: { level, text } });

/** EF-VEI-49 : corrige les traits d'une offre ; changer de niveau suppose de la place dans l'autre (409 sinon). */
export const correctChosenOffer = (id: number, correction: ChosenOfferCorrection) =>
  request<ChosenOffer>(`/chosen-offers/${String(id)}`, { method: 'PATCH', body: correction });

/** EF-VEI-48 : retire une offre choisie. */
export const deleteChosenOffer = (id: number) =>
  request<undefined>(`/chosen-offers/${String(id)}`, { method: 'DELETE' });
