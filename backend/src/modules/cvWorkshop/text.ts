/**
 * Text as compared by the workshop: accents and case ignored, ligatures spelled out (« ﬁ » read « fi », as PDF text
 * yields them), invisible characters (soft hyphen, zero-width space…) dropped, dashes and apostrophes made one, spaces
 * collapsed — so that « Août » and « aout », « 09/2024 – 08/2026 » and « 09/2024 − 08/2026 » read the same.
 */
export const foldText = (text: string): string =>
  text
    // Before the normalization, which would turn « ´ » into a space and an accent.
    .replace(/´/gu, "'")
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .toLowerCase()
    .replace(/[‐‑‒–—―−]/gu, '-')
    .replace(/[’‘ʼ´′`]/gu, "'")
    .replace(/\s+/gu, ' ')
    .trim();

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a folded text cites a phrase as a whole word or group of words, whatever its case and accents.
 * @req EF-CVX-27, RG-21
 */
export const cites = (foldedText: string, phrase: string): boolean => {
  const folded = foldText(phrase);
  if (folded === '') return true;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(folded)}($|[^\\p{L}\\p{N}])`, 'u').test(foldedText);
};

// « 10 000 », « 10.000 », « 10,000 » (a group of exactly three digits after a separator) read « 10000 ».
const THOUSANDS_SEPARATOR = /(?<=\d)[ \u00a0\u202f.,](?=\d{3}(?!\d))/gu;

// « 05/2020 », « 05-2020 », « 12/05/2020 »: a month (and a day) before a year, never a figure of its own (RG-21).
const DATE = /(?<!\d)(?:(?:0?[1-9]|[12]\d|3[01])[/.-])?(0?[1-9]|1[0-2])[/.-](\d{4})(?!\d)/gu;

/**
 * Every figure written in a text, as its digits: thousands separators ignored (« 10 000 » is « 10000 »), leading zeros
 * dropped (« 09 » is « 9 »), a decimal part counted apart (« 3,5 » gives « 3 » and « 5 »). The day and the month of a
 * date are not figures: « 05/2020 » gives « 2020 » only, so that a date never vouches for « 5 ans » or « Bac+5 ».
 * Never throws; an empty array when the text carries no figure.
 * @req RG-21, EF-CVX-47
 */
export const figuresIn = (text: string): string[] =>
  (text.replace(DATE, '$2').replace(THOUSANDS_SEPARATOR, '').match(/\d+/gu) ?? []).map((digits) =>
    digits.replace(/^0+(?=\d)/u, ''),
  );

/**
 * The dates « month/year » written in a text, as « 5/2020 » whatever their separator and leading zero; the day of a
 * full date is ignored. Never throws; an empty array when the text carries no date.
 * @req RG-21
 */
export const datesIn = (text: string): string[] =>
  [...text.matchAll(DATE)].map(([, month = '', year = '']) => `${String(Number(month))}/${year}`);

const NUMBER_WORDS = [
  'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante', 'cent',
  'one', 'two', 'three', 'four', 'five', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'fifteen', 'twenty',
].join('|');
// On folded text: « 5 ans », « 5+ ans », « cinq années », « dix-huit mois », « vingt et un ans », « 3 years ».
const DURATION = new RegExp(
  `(?<![\\p{L}\\p{N}])(\\d+(?:[.,]\\d+)?|(?:${NUMBER_WORDS})(?:[- ](?:et[- ])?(?:${NUMBER_WORDS}))*)\\s*\\+?\\s*` +
    '(ans?|annees?|mois|years?|months?)(?![\\p{L}\\p{N}])',
  'gu',
);
const MONTH_UNITS = new Set(['mois', 'month', 'months']);

/**
 * Every duration a text states — « 5 ans », « cinq années », « 18 mois », « 3 years » — in figures or in words, as
 * « quantity unit » with the unit made one (« an » or « mois ») and « une » read « un ». A duration of experience the
 * CV does not state as such is never shown (RG-21, EF-CVX-47). Never throws; an empty array when there is none.
 * @req RG-21, EF-CVX-47
 */
export const durationsIn = (text: string): string[] =>
  [...foldText(text).matchAll(DURATION)].map(([, quantity = '', unit = '']) => {
    const amount = /^\d/u.test(quantity)
      ? quantity.replace(/^0+(?=\d)/u, '')
      : quantity.replace(/[- ]+/gu, ' ').replace(/\bune\b/gu, 'un');
    return `${amount} ${MONTH_UNITS.has(unit) ? 'mois' : 'an'}`;
  });

/**
 * The sentences of a paragraph, each one trimmed and with its final punctuation (« . », « ! », « ? », « … »); a text
 * without final punctuation is one sentence. Never throws; an empty array for an empty or blank text.
 * @req RG-21, RG-24
 */
export const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
