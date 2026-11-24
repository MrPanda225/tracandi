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

/** RG-25 (v1.32): words that tell the contract, never the job. */
const CONTRACT_WORDS = new Set(['cdi', 'cdd', 'alternance', 'stage', 'freelance', 'interim']);
/** RG-25: words announcing a reference when digits follow them. */
const REFERENCE_WORDS = new Set(['ref', 'reference', 'n']);
/** RG-25: gender markers, removed only at the end of the title (« h f », « f h », « h », « f »). */
const GENDER_MARKERS = new Set(['h', 'f']);
const DIGITS = /^\d+$/u;

/**
 * RG-25 key of a job title: its RG-14 key without the contract types, the references (« ref », « reference », « n »
 * followed by digits) and the gender markers that end it — « Data Analyst H/F », « Data analyst (F/H) - CDI » and
 * « Data Analyst » have the same key. A title made of these words only keeps its RG-14 key.
 * @req RG-25
 */
export const jobTitleKey = (title: string): string => {
  const words = normalizeKey(title).split(' ').filter(Boolean);
  const kept = words.filter(
    (word, index) =>
      !CONTRACT_WORDS.has(word) &&
      !(REFERENCE_WORDS.has(word) && DIGITS.test(words[index + 1] ?? '')) &&
      !(DIGITS.test(word) && REFERENCE_WORDS.has(words[index - 1] ?? '')),
  );
  let end = kept.length;
  while (end > 0 && GENDER_MARKERS.has(kept[end - 1] ?? '')) end -= 1;
  return end > 0 ? kept.slice(0, end).join(' ') : words.join(' ');
};
