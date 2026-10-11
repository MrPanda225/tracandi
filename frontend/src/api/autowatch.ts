import { request } from './client';
import type { RunState } from './jobs';

/** EF-CFG-07 : les trois moments de la journée où la veille se lance (7 h, 13 h, 19 h, heure de Paris). */
export type WatchSlot = 'morning' | 'noon' | 'evening';

/** Dans l'ordre de la journée. */
export const WATCH_SLOTS: readonly WatchSlot[] = ['morning', 'noon', 'evening'];

/** EF-CFG-09 : « local » quand tous les appels au modèle sont allés au modèle local, « fallback » quand un fournisseur a pris le relais. */
export type PassLedBy = 'local' | 'fallback';

/**
 * EF-CFG-08 : un passage planifié du jour — son créneau, son état, ses compteurs, et pourquoi quand il a été ignoré ou
 * a échoué. Jamais le contenu d'une offre (schéma `AutomaticWatchPass` dans /api/docs).
 */
export interface AutomaticWatchPass {
  slot: WatchSlot;
  outcome: RunState['outcome'];
  startedAt: string;
  finishedAt: string | null;
  counters: Record<string, number>;
  /** EF-VEI-55 : la raison, en français, d'un passage ignoré ou en échec. */
  message: string | null;
  ledBy: PassLedBy | null;
}

/** Ce que le candidat a choisi, et ce que les passages du jour de Paris ont fait. */
export interface AutomaticWatchChoice {
  enabled: boolean;
  slots: WatchSlot[];
}

export interface AutomaticWatch extends AutomaticWatchChoice {
  /** EF-CFG-08 : la fin du dernier passage planifié réussi, quel que soit son jour ; null avant le premier. */
  lastSuccessAt: string | null;
  passes: AutomaticWatchPass[];
}

/** EF-CFG-07, EF-CFG-08 : la veille automatique du candidat et ses passages du jour. */
export const fetchAutomaticWatch = (signal?: AbortSignal) =>
  request<AutomaticWatch>('/watch/automatic', { signal });

/**
 * EF-CFG-07 : remplace le choix du candidat — activée ou non, et les créneaux ; les deux sont toujours donnés. L'API
 * répond 400 quand la veille est activée sans aucun créneau. La valeur rendue est celle que l'API a retenue.
 */
export const saveAutomaticWatch = (choice: AutomaticWatchChoice) =>
  request<AutomaticWatch>('/watch/automatic', { method: 'PUT', body: choice });
