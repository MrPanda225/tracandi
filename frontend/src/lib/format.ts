import type { ApplicationStatus, ContractType } from '../api/stats';

/** RG-01 labels, as displayed everywhere in the interface (ENF-UTI-01). */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  to_apply: 'À postuler',
  sent: 'Envoyée',
  acknowledged: 'Accusé reçu',
  interview: 'Entretien',
  offer: 'Proposition',
  rejected: 'Refusée',
};

export const CONTRACT_LABELS: Record<ContractType, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  alternance: 'Alternance',
  job_etudiant: 'Job étudiant',
  autre: 'Autre contrat',
  non_precise: 'Non précisé',
};

const LOCALE = 'fr-FR';
const integerFormat = new Intl.NumberFormat(LOCALE);
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortMonthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
const fullDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** Integer with French digit grouping (« 1 234 »). */
export const formatInteger = (value: number): string => integerFormat.format(value);

/** « 8 juin » — weeks and dates coming from the API are UTC instants. */
export const formatDayMonth = (iso: string): string => dayMonthFormat.format(new Date(iso));

/** « juin », « juil. » */
export const formatShortMonth = (iso: string): string => shortMonthFormat.format(new Date(iso));

/** « mardi 22 septembre », in the user's local time. */
export const formatToday = (now: Date): string => fullDateFormat.format(now);

/** « 1 candidature », « 3 candidatures » — French plural (0 and 1 are singular). */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string =>
  `${formatInteger(count)} ${count > 1 ? pluralForm : singular}`;
