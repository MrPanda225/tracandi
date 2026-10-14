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

// Starts only at the beginning of a run of address characters: one that goes on without an « @ » costs one pass,
// not one per letter (ENF-SEC-22).
const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// French numbers (06 12 34 56 78, 06.12.34.56.78, 0612345678) and international ones (+33 6 12 34 56 78). A number
// keeps one separator throughout, so « 09 2022 06 2023 » (dates) is none, and no digit touches it.
const PHONE =
  /(?<![\d+])(?:\+\d{1,3}[\s.-]?\d(?:[\s.-]?\d{2}){4}|0\d(?:([\s.-])\d{2}(?:\1\d{2}){3}|\d{8}))(?!\d)/g;
const LINK = /\b(?:https?:\/\/\S+|(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com)\/\S+)/gi;
/*
 * A postal address is cut out alone, never the line it shares with another column (EF-CVX-45): a street (12 rue des
 * Lilas) and its postal code and town if they follow, or a French postal code followed by a capitalised town (69003
 * Lyon). Case matters (no « i » flag): « 20000 factures » in a sentence is no address. It starts a line or follows a
 * separator or a label, never a word.
 */
const STREET_TYPES = [
  'rue',
  'avenue',
  'av.',
  'boulevard',
  'bd',
  'allée',
  'chemin',
  'place',
  'impasse',
  'route',
  'quai',
  'cours',
];
const capitalisable = (word: string): string =>
  `[${word.charAt(0).toUpperCase()}${word.charAt(0)}]${word.slice(1)}`;
const TOWN = String.raw`\p{Lu}[\p{L}'’-]*(?:[ -]\p{Lu}[\p{L}'’-]*)*`;
const POSTAL_TOWN = String.raw`\d{5}\s+${TOWN}`;
const STREET = String.raw`\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:${STREET_TYPES.map(capitalisable).join('|')})\b[^,•|·;\n]*(?:,\s*${POSTAL_TOWN})?`;
const ADDRESS = new RegExp(String.raw`(?<=^|[|•·;,:][ \t]{0,3})(?:${STREET}|${POSTAL_TOWN})`, 'mu');
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

// The separators a removed detail leaves behind, at the edge of a line (« | », « , », « : », dashes).
const SEPARATORS = '|•·,;:–-';
const isSpace = (character: string): boolean => /\s/u.test(character);
const isEdgeCharacter = (character: string): boolean => isSpace(character) || SEPARATORS.includes(character);

/** The line without the separators and spaces at either end, in one pass each: no pattern to backtrack on. */
const withoutEdgeSeparators = (line: string): string => {
  let start = 0;
  let end = line.length;
  while (start < end && isEdgeCharacter(line[start] ?? '')) start += 1;
  while (end > start && isEdgeCharacter(line[end - 1] ?? '')) end -= 1;
  return line.slice(start, end);
};

/** Two or more pipes with nothing but spaces between them are one pipe, spaced: « a | | b » and « a || b » are « a | b ». */
const collapsePipes = (line: string): string => {
  const segments = line.split('|');
  const out: string[] = [segments[0] ?? ''];
  let pipe = 1;
  while (pipe < segments.length) {
    let last = pipe;
    while (last < segments.length - 1 && (segments[last] ?? '').trim() === '') last += 1;
    if (last === pipe) {
      out.push('|', segments[pipe] ?? '');
    } else {
      out[out.length - 1] = (out[out.length - 1] ?? '').trimEnd();
      out.push(' | ', (segments[last] ?? '').trimStart());
    }
    pipe = last + 1;
  }
  return out.join('');
};

/** Removes the separators a detail leaves behind (« | », « , », « : ») and the lines left empty. */
const tidy = (text: string): string =>
  text
    .split('\n')
    .map((line) => collapsePipes(withoutEdgeSeparators(line)).trim())
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
  const address = ADDRESS.exec(cvText)?.[0].trim() ?? null;
  const contacts: CvContacts = {
    name,
    emails: unique(cvText.match(EMAIL) ?? []),
    phones: unique(cvText.match(PHONE) ?? []),
    address,
    links: unique(cvText.match(LINK) ?? []),
  };
  let text = cvText;
  if (address) text = text.split(address).join('');
  text = text.replace(LINK, '').replace(EMAIL, '').replace(PHONE, '');
  if (name) text = text.replace(new RegExp(escapeRegExp(name), 'g'), '');
  return { text: tidy(text), contacts };
};
