/** Separators recognized in a CSV file: a French spreadsheet exports `;`, an English one `,`. */
export type CsvDelimiter = ',' | ';';

/** Records of a CSV text, the header first, each as the list of its fields. */
export interface ParsedCsv {
  delimiter: CsvDelimiter;
  records: string[][];
}

/** The text is not valid CSV; `line` is the line of the file (1-based) where the faulty record starts. */
export class CsvSyntaxError extends Error {
  constructor(
    readonly line: number,
    reason: string,
  ) {
    super(`Ligne ${line} : ${reason}`);
    this.name = new.target.name;
  }
}

const BYTE_ORDER_MARK = '﻿';
const QUOTE = '"';
const CR = '\r';
const LF = '\n';

/**
 * Picks the separator of the first line: the one that appears more often outside quotes, `,` on a tie (RFC 4180).
 */
const detectDelimiter = (text: string): CsvDelimiter => {
  let semicolons = 0;
  let commas = 0;
  let isQuoted = false;
  for (const char of text) {
    if (char === QUOTE) isQuoted = !isQuoted;
    else if (!isQuoted && (char === LF || char === CR)) break;
    else if (!isQuoted && char === ';') semicolons += 1;
    else if (!isQuoted && char === ',') commas += 1;
  }
  return semicolons > commas ? ';' : ',';
};

/** Mutable cursor of one parse; kept local to `parseCsv`, never shared. */
interface ParseState {
  records: string[][];
  record: string[];
  field: string;
  line: number;
  recordLine: number;
}

const endRecord = (state: ParseState): void => {
  state.record.push(state.field);
  state.records.push(state.record);
  state.record = [];
  state.field = '';
};

/** Reads a quoted field starting after its opening quote; returns the index of the character after the closing one. */
const readQuoted = (text: string, start: number, state: ParseState): number => {
  let index = start;
  for (;;) {
    const closing = text.indexOf(QUOTE, index);
    if (closing === -1) throw new CsvSyntaxError(state.recordLine, 'guillemet ouvert jamais refermé');
    const chunk = text.slice(index, closing);
    state.field += chunk;
    state.line += chunk.split(LF).length - 1;
    if (text[closing + 1] !== QUOTE) return closing + 1;
    state.field += QUOTE;
    index = closing + 2;
  }
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
  const state: ParseState = { records: [], record: [], field: '', line: 1, recordLine: 1 };
  let index = 0;
  let isFieldStart = true;
  while (index < text.length) {
    const char = text[index];
    if (char === QUOTE && isFieldStart) {
      index = readQuoted(text, index + 1, state);
      const next = text[index];
      if (next !== undefined && next !== delimiter && next !== CR && next !== LF) {
        throw new CsvSyntaxError(state.recordLine, 'caractère inattendu après un guillemet fermant');
      }
      isFieldStart = false;
    } else if (char === delimiter) {
      state.record.push(state.field);
      state.field = '';
      index += 1;
      isFieldStart = true;
    } else if (char === CR || char === LF) {
      endRecord(state);
      index += char === CR && text[index + 1] === LF ? 2 : 1;
      state.line += 1;
      state.recordLine = state.line;
      isFieldStart = true;
    } else {
      state.field += char;
      index += 1;
      isFieldStart = false;
    }
  }
  if (state.field !== '' || state.record.length > 0) endRecord(state);
  return { delimiter, records: state.records };
};
