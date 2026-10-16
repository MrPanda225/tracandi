/*
 * Builds a one-page PDF whose text items sit at given x/y positions, in the order of the content stream — the way a
 * Canva or Word export lays out a CV in columns (EF-CVX-45). Items may use ligatures and private-use glyphs, which
 * the font maps from codes 1 to 4. No binary fixture is committed; every CV stays visibly fictitious.
 */

/** A piece of text: x from the left and y from the top of an A4 page, in points. */
export interface PositionedText {
  x: number;
  y: number;
  text: string;
  size?: number;
}

const A4_HEIGHT = 842;
const DEFAULT_SIZE = 10;
const WIN_ANSI_EN_DASH = 0x96;
const WIN_ANSI_EM_DASH = 0x97;
const WIN_ANSI_APOSTROPHE = 0x92;
const WIN_ANSI_BULLET = 0x95;
const SOFT_HYPHEN = 0xad;
const HYPHEN_MINUS = 0x2d;
const MAX_BYTE = 255;

// Characters outside Latin-1 and the codes the font gives them (see the /Differences array below).
const CODES = new Map<string, number>([
  ['ﬁ', 1],
  ['ﬂ', 2],
  ['', 3],
  ['▪', 4],
  ['–', WIN_ANSI_EN_DASH],
  ['—', WIN_ANSI_EM_DASH],
  ['’', WIN_ANSI_APOSTROPHE],
  ['•', WIN_ANSI_BULLET],
  ['­', SOFT_HYPHEN],
  ['−', HYPHEN_MINUS],
]);

const encode = (text: string): string =>
  [...text]
    .map((character) => {
      const code = CODES.get(character) ?? character.charCodeAt(0);
      if (code > MAX_BYTE) throw new Error(`Character not encodable in the fixture font: ${character}`);
      const byte = String.fromCharCode(code);
      return /[\\()]/.test(byte) ? `\\${byte}` : byte;
    })
    .join('');

const FONT =
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding ' +
  '/Differences [1 /fi /fl /uniF0E0 /uni25AA] >> >>';

/** A one-page PDF with the items in the given order (that of the content stream). */
export const buildPositionedPdf = (items: readonly PositionedText[]): Buffer => {
  const operations = items.map(
    ({ x, y, text, size = DEFAULT_SIZE }) =>
      `/F1 ${String(size)} Tf 1 0 0 1 ${String(x)} ${String(A4_HEIGHT - y)} Tm (${encode(text)}) Tj`,
  );
  const content = Buffer.from(['BT', ...operations, 'ET'].join('\n'), 'latin1');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [4 0 R] /Count 1 >>'),
    Buffer.from(FONT),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${String(content.length)} >>\nstream\n`),
      content,
      Buffer.from('\nendstream'),
    ]),
  ];
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const object = Buffer.concat([
      Buffer.from(`${String(index + 1)} 0 obj\n`),
      body,
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(object);
    length += object.length;
  });
  const xref = [
    'xref',
    `0 ${String(objects.length + 1)}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${String(objects.length + 1)} /Root 1 0 R >>`,
    'startxref',
    String(length),
    '%%EOF',
  ];
  parts.push(Buffer.from(xref.join('\n'), 'latin1'));
  return Buffer.concat(parts);
};
