/** Separators recognized in a CSV file: a French spreadsheet exports `;`, an English one `,`. */
export type CsvDelimiter = ',' | ';';

/** Records of a CSV text, the header first, each as the list of its fields. */
export interface ParsedCsv {
  delimiter: CsvDelimiter;
  records: string[][];
}

/**
 * The text is not valid CSV; `line` is the line of the file (1-based) where the faulty record starts.
 * @req EF-CAN-23
 */
export class CsvSyntaxError extends Error {
  constructor(
    readonly line: number,
    reason: string,
  ) {
    super(`Ligne ${line} : ${reason}`);
    this.name = new.target.name;
  }
}

const BYTE_ORDER_MARK = '\uFEFF';
const QUOTE = '"';
const CR = '\r';
const LF = '\n';

const isLineBreak = (char: string | undefined): boolean => char === CR || char === LF;

/**
 * Picks the separator of the first line: the one that appears more often outside quotes. On a tie, `;` when it
 * appears at all — a French export separates by `;` and keeps commas in its column names — else `,` (RFC 4180).
 */
const detectDelimiter = (text: string): CsvDelimiter => {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0 };
  let isQuoted = false;
  for (const char of text) {
    if (char === QUOTE) isQuoted = !isQuoted;
    else if (!isQuoted && isLineBreak(char)) break;
    else if (!isQuoted && (char === ',' || char === ';')) counts[char] += 1;
  }
  return counts[';'] > 0 && counts[';'] >= counts[','] ? ';' : ',';
};

/** Line of the file being read (1-based) and line where the current record started, for the error messages. */
interface Cursor {
  line: number;
  recordLine: number;
}

/** A field read, and the index of the character that ends it (a separator, a line break or the end of the text). */
interface ReadField {
  value: string;
  end: number;
}

/** Reads a quoted field starting after its opening quote, up to the character after its closing quote. */
const readQuoted = (text: string, start: number, cursor: Cursor): ReadField => {
  let value = '';
  let index = start;
  for (;;) {
    const closing = text.indexOf(QUOTE, index);
    if (closing === -1) throw new CsvSyntaxError(cursor.recordLine, 'guillemet ouvert jamais refermé');
    const chunk = text.slice(index, closing);
    value += chunk;
    cursor.line += chunk.split(LF).length - 1;
    if (text[closing + 1] !== QUOTE) return { value, end: closing + 1 };
    value += QUOTE;
    index = closing + 2;
  }
};

const readField = (
  text: string,
  start: number,
  { delimiter, cursor }: { delimiter: CsvDelimiter; cursor: Cursor },
): ReadField => {
  if (text[start] !== QUOTE) {
    let end = start;
    while (end < text.length && text[end] !== delimiter && !isLineBreak(text[end])) end += 1;
    return { value: text.slice(start, end), end };
  }
  const field = readQuoted(text, start + 1, cursor);
  const next = text[field.end];
  if (next !== undefined && next !== delimiter && !isLineBreak(next)) {
    throw new CsvSyntaxError(cursor.recordLine, 'caractère inattendu après un guillemet fermant');
  }
  return field;
};

/** Index after the line break at `index` (CRLF counts as one), or `index` at the end of the text. */
const skipLineBreak = (text: string, index: number): number => {
  if (text[index] === CR && text[index + 1] === LF) return index + 2;
  return index < text.length ? index + 1 : index;
};

/**
 * Parses a CSV text after RFC 4180: fields separated by `,` or `;` (detected on the first line), records separated by
 * CRLF, LF or CR, quoted fields holding separators, line breaks and doubled quotes. A UTF-8 byte order mark is
 * ignored; a line break at the very end does not add an empty record. Every record keeps all its fields, empty ones
 * included; the records may have different lengths.
 * @throws CsvSyntaxError for an unclosed quote, or a character between a closing quote and the next separator.
 * @req EF-CAN-23
 */
export const parseCsv = (input: string): ParsedCsv => {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(BYTE_ORDER_MARK.length) : input;
  const delimiter = detectDelimiter(text);
  const cursor: Cursor = { line: 1, recordLine: 1 };
  const records: string[][] = [];
  let record: string[] = [];
  let index = 0;
  while (index < text.length) {
    const field = readField(text, index, { delimiter, cursor });
    record.push(field.value);
    index = field.end;
    if (text[index] === delimiter) {
      index += 1;
      // A separator ending the text still opens a last, empty field.
      if (index === text.length) record.push('');
      continue;
    }
    records.push(record);
    record = [];
    index = skipLineBreak(text, index);
    cursor.line += 1;
    cursor.recordLine = cursor.line;
  }
  if (record.length > 0) records.push(record);
  return { delimiter, records };
};
