/**
 * Une période de CV — « Oct. 2024 – Avril 2026 » — lue et réécrite depuis deux sélecteurs de mois.
 *
 * Le profil stocke la période sous forme de texte (RG-12 : le rendu écrit ce que le profil dit). Ce module ne
 * change donc rien au modèle : il lit ce qui est déjà enregistré, et réécrit la même chaîne au format
 * « MM/AAAA – MM/AAAA » que `formatDates` attend côté rendu (RG-15).
 */

/** Ce que le candidat écrit pour une période qui n'est pas finie. */
const CURRENT_LABEL = 'aujourd’hui';
/** Le tiret demi-cadratin sépare les deux bornes, comme dans le modèle Word du candidat. */
const SEPARATOR = ' – ';
const SEPARATORS = /\s*[–—-]\s*|\s+à\s+|\s+au\s+/;

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  fevrier: 2,
  fevr: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

const FIRST_MONTH = 1;
const LAST_MONTH = 12;
const YEAR_LENGTH = 4;

/** Une borne : le mois au format `AAAA-MM` de `<input type="month">`, ou '' quand elle n'est pas lisible. */
export interface Period {
  start: string;
  end: string;
  /** La période n'est pas finie : la borne de fin n'est alors pas demandée. */
  isCurrent: boolean;
  /**
   * Ce qui est enregistré n'a pas pu être relu en deux mois — « Depuis 2023 », une note libre. La valeur est
   * conservée telle quelle tant que le candidat ne choisit pas de date : rien n'est perdu en silence.
   */
  original: string | null;
}

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Le point et l'apostrophe deviennent des espaces — « Oct. » et « aujourd'hui » —, mais pas la barre
    // oblique, qui sépare le mois de l'année dans « 10/2024 ».
    .replace(/[.'\u2019]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (month: number): string => String(month).padStart(2, '0');

/** Le mois `AAAA-MM` que désigne une borne écrite « 10/2024 », « Oct. 2024 » ou « 2024 ». */
const monthOf = (bound: string, fallbackMonth: number): string | null => {
  const text = normalize(bound);
  const slashed = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(text);
  if (slashed) {
    const month = Number(slashed[1]);
    return month >= FIRST_MONTH && month <= LAST_MONTH ? `${slashed[2]}-${pad(month)}` : null;
  }
  const year = /\b(\d{4})\b/.exec(text)?.[1];
  if (!year) return null;
  const named = Object.entries(MONTHS).find(([name]) => new RegExp(`\\b${name}\\b`).test(text));
  return `${year}-${pad(named?.[1] ?? fallbackMonth)}`;
};

const isCurrentBound = (bound: string): boolean =>
  ['aujourd hui', 'aujourdhui', 'present', 'en cours', 'ce jour', 'maintenant'].includes(normalize(bound));

/**
 * Relit une période enregistrée. Une borne sans mois prend janvier pour le début et décembre pour la fin, ce qui
 * est ce que « 2024 – 2026 » veut dire sur un CV. Ce qui n'est pas relisible est rendu dans `original`.
 */
export const readPeriod = (dates: string): Period => {
  const empty: Period = { start: '', end: '', isCurrent: false, original: null };
  if (dates.trim() === '') return empty;

  const [from, to] = dates.split(SEPARATORS, 2);
  const start = monthOf(from ?? '', FIRST_MONTH);
  if (start === null) return { ...empty, original: dates };
  if (to === undefined) return { start, end: '', isCurrent: false, original: null };
  if (isCurrentBound(to)) return { start, end: '', isCurrent: true, original: null };

  const end = monthOf(to, LAST_MONTH);
  return end === null ? { ...empty, original: dates } : { start, end, isCurrent: false, original: null };
};

/** Écrit « MM/AAAA », ou '' quand le sélecteur est vide. */
const frenchMonth = (month: string): string => {
  const [year, number] = month.split('-');
  return year?.length === YEAR_LENGTH && number ? `${number}/${year}` : '';
};

/**
 * Réécrit la période telle qu'elle sera enregistrée et imprimée sur le CV. Tant qu'aucun début n'est choisi, la
 * valeur d'origine est rendue inchangée : le candidat ne perd pas ce qu'il avait écrit.
 */
export const writePeriod = (period: Period): string => {
  const start = frenchMonth(period.start);
  if (start === '') return period.original ?? '';
  if (period.isCurrent) return `${start}${SEPARATOR}${CURRENT_LABEL}`;
  const end = frenchMonth(period.end);
  return end === '' ? start : `${start}${SEPARATOR}${end}`;
};
