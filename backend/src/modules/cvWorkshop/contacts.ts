/** The contact details of an imported CV, kept aside and never sent to the AI (ENF-RGP-07). */
export interface CvContacts {
  name: string | null;
  emails: string[];
  phones: string[];
  address: string | null;
  links: string[];
}

/** The text of a CV without its contact details, and the details themselves. */
export interface SeparatedCv {
  text: string;
  contacts: CvContacts;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// French numbers (06 12 34 56 78, 06.12.34.56.78) and international ones (+33 6 12 34 56 78).
const PHONE = /(?:\+\d{1,3}[\s.-]?\d(?:[\s.-]?\d{2}){4}|\b0\d(?:[\s.-]?\d{2}){4})\b/g;
const LINK = /\b(?:https?:\/\/\S+|(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com)\/\S+)/gi;
// A street line (12 rue des Lilas) or a French postal code followed by a town (69003 Lyon).
const ADDRESS_LINE =
  /^.*(?:\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|allée|chemin|place|impasse|route|quai|cours)\b|\b\d{5}\s+[A-ZÀ-Ý][\p{L}-]+).*$/imu;
const NAME_WORD = /^[\p{Lu}][\p{L}'’-]*$/u;
const NOT_A_NAME = /\b(?:cv|curriculum|vitae|résumé|resume|profil)\b/i;
const MIN_NAME_WORDS = 2;
const MAX_NAME_WORDS = 4;
const MAX_NAME_LENGTH = 50;

/** The first line, when it reads as a person's name: 2 to 4 capitalised words, letters only. */
const findName = (lines: readonly string[]): string | null => {
  const first = lines.find((line) => line.trim() !== '')?.trim() ?? '';
  const words = first.split(/\s+/);
  const isName =
    first.length <= MAX_NAME_LENGTH &&
    words.length >= MIN_NAME_WORDS &&
    words.length <= MAX_NAME_WORDS &&
    words.every((word) => NAME_WORD.test(word)) &&
    !NOT_A_NAME.test(first);
  return isName ? first : null;
};

const unique = (values: readonly string[]): string[] => [...new Set(values.map((value) => value.trim()))];

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes the separators a detail leaves behind (« | », « , », « : ») and the lines left empty. */
const tidy = (text: string): string =>
  text
    .split('\n')
    .map((line) =>
      line
        .replace(/(?:\s*[|•·,;:–-]\s*)+$/u, '')
        .replace(/^(?:\s*[|•·,;:–-]\s*)+/u, '')
        .replace(/\s*\|\s*(?:\|\s*)+/g, ' | ')
        .trim(),
    )
    .filter((line) => line !== '' && !/^[\p{L}\s'’]+:$/u.test(line))
    .join('\n');

/**
 * Takes the name, e-mail addresses, phone numbers, postal address and web links out of the text of a CV, and hands
 * them back apart, to be put back in the downloaded CV (ENF-RGP-07). The name is recognised on the first line only,
 * then taken out wherever it appears again. The professional content is left as it is.
 * @req ENF-RGP-07
 */
export const separateContacts = (cvText: string): SeparatedCv => {
  const lines = cvText.split('\n');
  const name = findName(lines);
  const address = lines.find((line) => ADDRESS_LINE.test(line))?.trim() ?? null;
  const contacts: CvContacts = {
    name,
    emails: unique(cvText.match(EMAIL) ?? []),
    phones: unique(cvText.match(PHONE) ?? []),
    address,
    links: unique(cvText.match(LINK) ?? []),
  };
  let text = cvText;
  if (address) text = text.split('\n').filter((line) => line.trim() !== address).join('\n');
  text = text.replace(LINK, '').replace(EMAIL, '').replace(PHONE, '');
  if (name) text = text.replace(new RegExp(escapeRegExp(name), 'g'), '');
  return { text: tidy(text), contacts };
};
