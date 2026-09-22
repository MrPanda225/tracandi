import type { ApplicationEmail, EmailCategory } from '../api/applications';
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

const keysOf = <K extends string>(record: Record<K, string>): K[] => Object.keys(record) as K[];

/** RG-01 order, for status pickers. */
export const APPLICATION_STATUSES = keysOf(STATUS_LABELS);
export const CONTRACT_TYPES = keysOf(CONTRACT_LABELS);

/** The status named by `value` (a `<select>` value is a plain string), or undefined. */
export const toApplicationStatus = (value: string): ApplicationStatus | undefined =>
  APPLICATION_STATUSES.find((status) => status === value);

/** The contract type named by `value`, or undefined. */
export const toContractType = (value: string): ContractType | undefined =>
  CONTRACT_TYPES.find((type) => type === value);

/** Message categories of the chronology (EF-CAN-04). */
export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  sent_application: 'Candidature envoyée',
  acknowledged: 'Accusé de réception',
  interview: 'Entretien',
  offer: 'Proposition',
  rejected: 'Refus',
  job_alert: 'Alerte emploi',
};

export const DIRECTION_LABELS: Record<ApplicationEmail['direction'], string> = {
  inbound: 'Reçu',
  outbound: 'Envoyé',
};

const LOCALE = 'fr-FR';
const integerFormat = new Intl.NumberFormat(LOCALE);
const dateFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortMonthFormat = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });
const fullDateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** Integer with French digit grouping (« 1 234 »). */
export const formatInteger = (value: number): string => integerFormat.format(value);

/** « 8 juin » — weeks and dates coming from the API are UTC instants. */
export const formatDayMonth = (iso: string): string => dayMonthFormat.format(new Date(iso));

/** « juin », « juil. » */
export const formatShortMonth = (iso: string): string => shortMonthFormat.format(new Date(iso));

/** « 3 sept. 2026 », in the user's local time. */
export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

/** « 3 sept. 2026, 12:00 », in the user's local time. */
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso));

/** « mardi 22 septembre », in the user's local time. */
export const formatToday = (now: Date): string => fullDateFormat.format(now);

/** « 1 candidature », « 3 candidatures » — French plural (0 and 1 are singular). */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`): string =>
  `${formatInteger(count)} ${count > 1 ? pluralForm : singular}`;
