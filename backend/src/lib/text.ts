const COMBINING_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * RG-14 normalized key: lower case, accents removed, every non-alphanumeric run replaced by one space, trimmed.
 * Two names with the same key designate the same company or job title. Returns '' for a name without letters or digits.
 * @req RG-14
 */
export const normalizeKey = (name: string): string =>
  name.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(NON_ALPHANUMERIC, ' ').trim();
