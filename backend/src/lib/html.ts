/** Named entities HTML text carries (ATS descriptions, e-mails); anything else is left as it was written. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  euml: 'ë',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  ouml: 'ö',
  ugrave: 'ù',
  ucirc: 'û',
  uuml: 'ü',
  icirc: 'î',
  iuml: 'ï',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  deg: '°',
  euro: '€',
};

const NUMERIC_ENTITY = /&#(x?)([0-9a-f]+);/gi;
const NAMED_ENTITY = /&([a-z]+);/gi;
const HEXADECIMAL = 16;
const DECIMAL = 10;
const MAX_CODE_POINT = 0x10ffff;

/**
 * The characters the entities of an HTML text stand for. An entity nobody knows, or a number beyond Unicode, is
 * left as it was written: never an exception on external text.
 */
export const decodeHtmlEntities = (html: string): string =>
  html
    .replace(NUMERIC_ENTITY, (whole, hex: string, digits: string) => {
      const code = Number.parseInt(digits, hex ? HEXADECIMAL : DECIMAL);
      return Number.isNaN(code) || code > MAX_CODE_POINT ? whole : String.fromCodePoint(code);
    })
    .replace(NAMED_ENTITY, (whole, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? whole);
