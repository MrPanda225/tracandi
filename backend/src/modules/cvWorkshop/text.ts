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

/** Every number written in a text, as its digits (« 12 », « 2024 », « 3,5 » gives « 3 » and « 5 »). */
export const numbersIn = (text: string): string[] => text.match(/\d+/gu) ?? [];
