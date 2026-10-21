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

/**
 * Every figure written in a text, as its digits: thousands separators ignored (« 10 000 » is « 10000 »), leading zeros
 * dropped (« 09 » is « 9 »), a decimal part counted apart (« 3,5 » gives « 3 » and « 5 »).
 * @req RG-21
 */
export const figuresIn = (text: string): string[] =>
  (text.replace(THOUSANDS_SEPARATOR, '').match(/\d+/gu) ?? []).map((digits) => digits.replace(/^0+(?=\d)/u, ''));

/** The sentences of a paragraph, each one with its final punctuation. */
export const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
