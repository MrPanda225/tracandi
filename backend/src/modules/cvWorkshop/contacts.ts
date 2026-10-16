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
// French numbers (06 12 34 56 78, 0612 34 56 78, 06 12 3456 78, 06.12.34.56.78, 0612345678) and international ones
// (+33 6 12 34 56 78, +33 (0)6 12 34 56 78): five pairs of digits, each separated or not. Dates stay out: « 09 2022
// 06 2023 » has twelve digits, and no digit may touch a number.
const SEP = String.raw`[\p{Zs}\t.-]`;
const PHONE = new RegExp(
  String.raw`(?<![\d+])(?:\+\d{1,3}${SEP}?(?:\(0\)${SEP}?)?\d|0\d)(?:${SEP}?\d{2}){4}(?!\d)`,
  'gu',
);
const LINK = /\b(?:https?:\/\/\S+|(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com)\/\S+)/gi;
/*
 * A postal address is cut out alone, never the line it shares with another column (EF-CVX-45): a street (12 rue des
 * Lilas) and its postal code and town if they follow, or a French postal code followed by a town (69003 Lyon). Three
 * places are read: the start of a line, after any icon, bullet, label (« Adresse »), or one stray character that OCR
 * made of a map pin; after a separator; and anywhere when the street is followed by its postal code and town. A
 * street alone in the middle of a sentence (« 3 cours de SQL ») is no address, nor is « 20000 factures par mois ».
 * Every pattern is linear: bounded repetitions, no nested quantifier (ENF-SEC-22).
 */
const caseless = (word: string): string =>
  [...word]
    .map((letter) =>
      letter.toLowerCase() === letter.toUpperCase()
        ? letter.replace('.', String.raw`\.`)
        : `[${letter.toUpperCase()}${letter.toLowerCase()}]`,
    )
    .join('');
const STREET_TYPES = [
  'rue',
  'avenue',
  'av.',
  'boulevard',
  'bd',
  'allée',
  'allee',
  'chemin',
  'place',
  'impasse',
  'route',
  'quai',
  'cours',
  'square',
  'résidence',
  'residence',
  'lieu-dit',
].map(caseless);
const LABELS = ['adresse', 'address', 'domicile'].map(caseless);
const MAX_STREET_NAME = 60;
const SEPARATOR_END = String.raw`(?=[ \t]*(?:$|[|•·;,]))`;
const WORD = String.raw`[\p{L}'’-]+`;
// A capitalised or upper-case town, or a town in any case that ends the line or is followed by a separator.
const TOWN = String.raw`(?:\p{Lu}[\p{L}'’-]*(?:[ -]\p{Lu}[\p{L}'’-]*)*|${WORD}(?:[ -]${WORD}){0,3}${SEPARATOR_END})`;
const POSTAL_TOWN = String.raw`\d{5}(?!\d)[ \t]+${TOWN}`;
const STREET = String.raw`\d{1,4}(?:[ \t]?(?:bis|ter|BIS|TER))?,?[ \t]+(?:${STREET_TYPES.join('|')})(?![\p{L}\p{N}])(?:(?!\d{5}(?!\d))[^,•|·;\n]){0,${MAX_STREET_NAME}}`;
const STREET_FULL = String.raw`${STREET}(?:,?[ \t]*${POSTAL_TOWN})?`;
const NO_ALNUM = String.raw`[^\p{L}\p{N}\n]*`;
const LINE_START_ADDRESS = new RegExp(
  String.raw`^${NO_ALNUM}(?:(?:${LABELS.join('|')})${NO_ALNUM})?(?:(?:\p{L}[ \t]*|\p{N}[ \t]+))?(?<address>${STREET_FULL}|${POSTAL_TOWN})`,
  'gmu',
);
const AFTER_SEPARATOR_ADDRESS = new RegExp(
  String.raw`(?<=[|•·;,:\p{Co}\p{So}][ \t]{0,3})(?<address>${STREET_FULL})`,
  'gmu',
);
const INLINE_ADDRESS = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?<address>${STREET},?[ \t]*${POSTAL_TOWN})`,
  'gmu',
);
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

interface AddressSpan {
  start: number;
  end: number;
  address: string;
}

/** Where the postal addresses are, in the order of the text and without overlap; a span starts at its line's icon or label. */
const findAddressSpans = (text: string): AddressSpan[] => {
  const found: AddressSpan[] = [];
  for (const pattern of [LINE_START_ADDRESS, AFTER_SEPARATOR_ADDRESS, INLINE_ADDRESS]) {
    for (const match of text.matchAll(pattern)) {
      const address = match.groups?.['address'] ?? '';
      const isLineStart = pattern === LINE_START_ADDRESS;
      found.push({
        start: isLineStart ? match.index : match.index + match[0].length - address.length,
        end: match.index + match[0].length,
        address: address.trim(),
      });
    }
  }
  const spans: AddressSpan[] = [];
  for (const span of found.sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = spans[spans.length - 1];
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end);
    else spans.push({ ...span });
  }
  return spans;
};

/** The text without the given spans (sorted, disjoint). */
const cutSpans = (text: string, spans: readonly AddressSpan[]): string => {
  let out = '';
  let from = 0;
  for (const span of spans) {
    out += text.slice(from, span.start);
    from = span.end;
  }
  return out + text.slice(from);
};

/**
 * Takes the name, e-mail addresses, phone numbers, postal address and web links out of the text of a CV, and hands
 * them back apart, to be put back in the downloaded CV (ENF-RGP-07). The name is recognised on the first line only,
 * then taken out wherever it appears again. The professional content is left as it is.
 * @req ENF-RGP-07
 */
export const separateContacts = (cvText: string): SeparatedCv => {
  const lines = cvText.split('\n');
  const name = findName(lines);
  const spans = findAddressSpans(cvText);
  const address = spans.length > 0 ? unique(spans.map((span) => span.address)).join(', ') : null;
  const contacts: CvContacts = {
    name,
    emails: unique(cvText.match(EMAIL) ?? []),
    phones: unique(cvText.match(PHONE) ?? []),
    address,
    links: unique(cvText.match(LINK) ?? []),
  };
  let text = cvText;
  text = cutSpans(text, spans);
  text = text.replace(LINK, '').replace(EMAIL, '').replace(PHONE, '');
  if (name) text = text.replace(new RegExp(escapeRegExp(name), 'g'), '');
  return { text: tidy(text), contacts };
};
