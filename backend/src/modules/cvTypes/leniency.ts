/** Lower case, no accent, trimmed: « Confirmé » and « confirme » read alike. */
export const plainText = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const KEYWORD_MAX_LENGTH = 60;
const KEYWORDS_MAX = 15;

/**
 * The keywords a model lists, put in the bounds of the targets: those that are text, not empty and not longer than a
 * keyword may be, each once whatever its case, fifteen at most. A model that lists sixteen has not lost its offer.
 */
export const tidyKeywords = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const keyword = item.trim();
    const key = keyword.toLocaleLowerCase('fr');
    if (keyword === '' || keyword.length > KEYWORD_MAX_LENGTH || seen.has(key)) continue;
    seen.add(key);
    kept.push(keyword);
  }
  return kept.slice(0, KEYWORDS_MAX);
};
