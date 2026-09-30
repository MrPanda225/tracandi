import { deflateSync } from 'node:zlib';

/*
 * Builds small PDF files for the tests of the CV workshop (T-510), so that no binary fixture is committed and every
 * CV stays visibly fictitious. Only what a CV reader needs: pages of text, pages made of one grey image (a scan),
 * and a document locked by a password.
 */

/** A grey image: one byte per pixel, 0 black to 255 white, rows from top to bottom. */
export interface GrayImage {
  width: number;
  height: number;
  pixels: Buffer;
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const MARGIN = 50;
const FONT_SIZE = 11;
const LEADING = 14;

const escapeText = (text: string): string => text.replace(/[\\()]/g, (char) => `\\${char}`);

const textContent = (lines: readonly string[]): Buffer =>
  Buffer.from(
    [
      'BT',
      `/F1 ${FONT_SIZE} Tf`,
      `${LEADING} TL`,
      `${MARGIN} ${A4_HEIGHT - MARGIN} Td`,
      ...lines.map((line) => `(${escapeText(line)}) Tj T*`),
      'ET',
    ].join('\n'),
    'latin1',
  );

const imageContent = (): Buffer => Buffer.from(`q ${A4_WIDTH} 0 0 ${A4_HEIGHT} 0 0 cm /Im1 Do Q`, 'latin1');

const stream = (dictionary: string, data: Buffer): Buffer =>
  Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${data.length} >>\nstream\n`, 'latin1'),
    data,
    Buffer.from('\nendstream', 'latin1'),
  ]);

type PageSpec = { kind: 'text'; lines: readonly string[] } | { kind: 'image'; image: GrayImage };

/** Serialises numbered objects into a PDF with a correct cross-reference table. */
const assemble = (objects: Buffer[], trailerExtra = ''): Buffer => {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [];
  let length = parts[0]?.length ?? 0;
  objects.forEach((body, index) => {
    offsets.push(length);
    const object = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
    parts.push(object);
    length += object.length;
  });
  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>`,
    'startxref',
    String(length),
    '%%EOF',
  ].join('\n');
  parts.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(parts);
};

const buildPdf = (pages: readonly PageSpec[], options: { isLocked?: boolean } = {}): Buffer => {
  // 1 catalog, 2 page tree, 3 font, then three objects per page: page, content, image (unused for text pages).
  const firstPage = 4;
  const pageIds = pages.map((_, index) => firstPage + index * 3);
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'),
    Buffer.from(
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    ),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      'latin1',
    ),
  ];
  pages.forEach((page, index) => {
    const pageId = pageIds[index] ?? 0;
    const resources =
      page.kind === 'text' ? '<< /Font << /F1 3 0 R >> >>' : `<< /XObject << /Im1 ${pageId + 2} 0 R >> >>`;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources ${resources} /Contents ${pageId + 1} 0 R >>`,
        'latin1',
      ),
      stream('', page.kind === 'text' ? textContent(page.lines) : imageContent()),
      page.kind === 'text'
        ? Buffer.from('null', 'latin1')
        : stream(
            `/Type /XObject /Subtype /Image /Width ${page.image.width} /Height ${page.image.height} ` +
              '/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode',
            deflateSync(page.image.pixels),
          ),
    );
  });
  if (!options.isLocked) return assemble(objects);
  // A standard security handler whose check values match no password: readers ask for one (ENF-SEC-22 tests).
  const lockId = objects.length + 1;
  objects.push(
    Buffer.from(
      `<< /Filter /Standard /V 1 /R 2 /O <${'ab'.repeat(32)}> /U <${'cd'.repeat(32)}> /P -44 >>`,
      'latin1',
    ),
  );
  const fileId = '0123456789abcdef0123456789abcdef';
  return assemble(objects, `/Encrypt ${lockId} 0 R /ID [<${fileId}> <${fileId}>] `);
};

/** A PDF whose pages carry real text, one array of lines per page. */
export const buildTextPdf = (pages: readonly (readonly string[])[]): Buffer =>
  buildPdf(pages.map((lines) => ({ kind: 'text', lines })));

/** A PDF whose pages are images only, as a scanner produces them. */
export const buildScannedPdf = (images: readonly GrayImage[]): Buffer =>
  buildPdf(images.map((image) => ({ kind: 'image', image })));

/** A PDF whose first page carries text and whose second page is a scanned image. */
export const buildMixedPdf = (lines: readonly string[], image: GrayImage): Buffer =>
  buildPdf([
    { kind: 'text', lines },
    { kind: 'image', image },
  ]);

/** A PDF locked by a password nobody knows. */
export const buildLockedPdf = (lines: readonly string[]): Buffer =>
  buildPdf([{ kind: 'text', lines }], { isLocked: true });

/** A plain white image, for a blank scanned page. */
export const blankImage = (width = 60, height = 80): GrayImage => ({
  width,
  height,
  pixels: Buffer.alloc(width * height, 255),
});

/** Reads a binary PGM (P5) image, as `pdftoppm -gray` writes it. */
export const parsePgm = (file: Buffer): GrayImage => {
  const header = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(file.subarray(0, 64).toString('latin1'));
  if (!header?.[1] || !header[2]) throw new Error('not a binary PGM image');
  const width = Number(header[1]);
  const height = Number(header[2]);
  return { width, height, pixels: file.subarray(header[0].length, header[0].length + width * height) };
};

/** A fictitious CV, as its text layer would read. */
export const FICTITIOUS_CV_LINES = [
  'Camille Durand',
  'Data Analyst',
  'camille.durand@example.com | 06 12 34 56 78',
  '12 rue des Lilas, 69003 Lyon',
  'linkedin.com/in/camille-durand-exemple',
  'EXPERIENCES PROFESSIONNELLES',
  '09/2024 - 08/2026  Data Analyst - Atelier Nova',
  'Tableaux de bord Power BI pour 12 equipes commerciales.',
  'FORMATION',
  '2024  Master Informatique - Universite de Lyon',
  'COMPETENCES',
  'SQL, Python, Power BI',
] as const;
