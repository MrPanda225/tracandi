/** EF-VEI-45, EF-VEI-49 : bornes d'un intitulé et de ses mots-clés, contrôlées aussi par l'API (schéma des cibles). */
export const LABEL_MAX_LENGTH = 80;
export const KEYWORDS_MAX = 15;
export const KEYWORD_MAX_LENGTH = 60;

/**
 * The keywords of a field typed as a list: split on commas, trimmed, empty ones dropped, each kept once whatever its
 * case — the API keeps them that way, so what is counted here is what it would count.
 */
export const keywordsOf = (text: string): string[] => {
  const seen = new Set<string>();
  return text
    .split(',')
    .map((keyword) => keyword.trim())
    .filter((keyword) => {
      const key = keyword.toLocaleLowerCase('fr');
      if (keyword === '' || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** The reason, in French, why a label is refused, or null when it is acceptable. */
export const describeLabelProblem = (label: string): string | null => {
  const length = label.trim().length;
  if (length === 0) return 'Indiquez un intitulé.';
  return length > LABEL_MAX_LENGTH ? 'L’intitulé dépasse 80 caractères : gardez l’essentiel.' : null;
};

/** The reason, in French, why a list of keywords is refused, or null when it is acceptable. */
export const describeKeywordsProblem = (keywords: readonly string[]): string | null => {
  if (keywords.length === 0) return 'Indiquez au moins un mot-clé.';
  if (keywords.length > KEYWORDS_MAX) return 'Gardez 15 mots-clés au plus.';
  return keywords.some((keyword) => keyword.length > KEYWORD_MAX_LENGTH)
    ? 'Un mot-clé dépasse 60 caractères.'
    : null;
};
