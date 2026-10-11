import type { ExperienceLevel } from '../api/criteria';

/** RG-29, EF-VEI-47 : bornes des années d'expérience, contrôlées aussi par l'API. */
export const MIN_YEARS = 0;
export const MAX_YEARS = 50;

/** RG-28 : « junior » jusqu'à 2 ans, « confirmé » de 3 à 7 ans, « senior » à partir de 8 ans. */
const CONFIRMED_FROM_YEARS = 3;
const SENIOR_FROM_YEARS = 8;

export const LEVEL_LABELS: Readonly<Record<ExperienceLevel, string>> = {
  junior: 'Junior',
  confirme: 'Confirmé',
  senior: 'Senior',
};

/** RG-28, EF-VEI-44 : le niveau que donnent des années d'expérience ; le même calcul que l'API, pour l'afficher en direct. */
export const levelOfYears = (years: number): ExperienceLevel => {
  if (years >= SENIOR_FROM_YEARS) return 'senior';
  return years >= CONFIRMED_FROM_YEARS ? 'confirme' : 'junior';
};

export const YEARS_PROBLEM = 'Indiquez un nombre entier d’années, de 0 à 50.';

/** Ce qu'on lit d'un champ d'années : un nombre, aucun (champ vide), ou ce qui l'empêche d'être accepté. */
export type YearsReading = { years: number | null } | { problem: string };

/**
 * EF-VEI-47 : lit le texte d'un champ d'années. Un champ vide n'est pas une erreur (« pas d'années » : le niveau
 * peut se choisir à la place) ; tout autre texte doit être un entier de 0 à 50.
 */
export const parseYears = (text: string): YearsReading => {
  const trimmed = text.trim();
  if (trimmed === '') return { years: null };
  const years = /^\d+$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
  return years >= MIN_YEARS && years <= MAX_YEARS ? { years } : { problem: YEARS_PROBLEM };
};
