import { inflateRawSync } from 'node:zlib';

/**
 * Files of a zip archive, by name. A .docx is a zip, and no declared dependency of the project reads one: the
 * format is read here rather than adding a library for the tests alone (CLAUDE.md, dépendances).
 */
const END_OF_CENTRAL_DIRECTORY = 0x0605_4b50;
const CENTRAL_ENTRY = 0x0201_4b50;
const CENTRAL_ENTRY_HEADER_BYTES = 46;
const LOCAL_ENTRY_HEADER_BYTES = 30;
const DEFLATED = 8;

const endOfCentralDirectoryAt = (archive: Buffer): number => {
  for (let at = archive.length - 4; at >= 0; at -= 1) {
    if (archive.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) return at;
  }
  throw new Error('Not a zip archive: no end of central directory');
};

/** Where one file starts in the archive, how it is stored and how many bytes it takes. */
interface StoredFile {
  offset: number;
  compression: number;
  compressedBytes: number;
}

const fileAt = (archive: Buffer, { offset, compression, compressedBytes }: StoredFile): Buffer => {
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const start = offset + LOCAL_ENTRY_HEADER_BYTES + nameLength + extraLength;
  const stored = archive.subarray(start, start + compressedBytes);
  return compression === DEFLATED ? inflateRawSync(stored) : stored;
};

/** Every file of the archive, decompressed, as text. */
export const readZip = (archive: Buffer): Map<string, string> => {
  const eocd = endOfCentralDirectoryAt(archive);
  const entryCount = archive.readUInt16LE(eocd + 10);
  const files = new Map<string, string>();
  let at = archive.readUInt32LE(eocd + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(at) !== CENTRAL_ENTRY) throw new Error('Not a zip archive: broken directory');
    const compression = archive.readUInt16LE(at + 10);
    const compressedBytes = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localOffset = archive.readUInt32LE(at + 42);
    const name = archive.toString(
      'utf8',
      at + CENTRAL_ENTRY_HEADER_BYTES,
      at + CENTRAL_ENTRY_HEADER_BYTES + nameLength,
    );
    files.set(
      name,
      fileAt(archive, { offset: localOffset, compression, compressedBytes }).toString('utf8'),
    );
    at += CENTRAL_ENTRY_HEADER_BYTES + nameLength + extraLength + commentLength;
  }
  return files;
};

/** The main document of a .docx, as WordprocessingML. */
export const readDocumentXml = (docx: Buffer): string => {
  const document = readZip(docx).get('word/document.xml');
  if (document === undefined) throw new Error('Not a .docx: no word/document.xml');
  return document;
};

/** The visible text of a .docx, paragraph by paragraph, in the order of the document. */
export const readParagraphs = (docx: Buffer): string[] =>
  [...readDocumentXml(docx).matchAll(/<w:p(?: [^>]*)?>(.*?)<\/w:p>/gs)].map(([, paragraph]) =>
    [...(paragraph ?? '').matchAll(/<w:t(?: [^>]*)?>(.*?)<\/w:t>/gs)]
      .map(([, text]) => text ?? '')
      .join('')
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
