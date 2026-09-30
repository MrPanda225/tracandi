const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * RG-14 normalized key: lower case, accents removed, every non-alphanumeric run replaced by one space, trimmed.
 * Two names with the same key designate the same company or job title. Returns '' for a name without letters or digits.
 * @req RG-14
 */
export const normalizeKey = (name: string): string =>
  name.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_ALPHANUMERIC, ' ').trim();

/** RG-26 (v1.32): legal forms and suffixes that never tell two companies apart. */
const COMPANY_SUFFIXES = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'se',
  'gmbh',
  'inc',
  'ltd',
  'llc',
  'group',
  'groupe',
  'france',
]);

/**
 * RG-26 key of a company: its RG-14 key, without the legal forms and suffixes that end it — « Capgemini »,
 * « CAPGEMINI SE » and « Capgemini France » have the same key. A name made of suffixes only keeps its RG-14 key.
 * @req RG-26
 */
export const companyKey = (name: string): string => {
  const words = normalizeKey(name).split(' ').filter(Boolean);
  let end = words.length;
  while (end > 1 && COMPANY_SUFFIXES.has(words[end - 1] ?? '')) end -= 1;
  return words.slice(0, end).join(' ');
};
