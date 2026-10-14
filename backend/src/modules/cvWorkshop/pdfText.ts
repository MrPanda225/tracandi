import { extractText, getDocumentProxy } from 'unpdf';
import { CvUnreadableError } from './errors.js';
import type { PdfTextLayer } from './pdftotext.js';

/** Names pdf.js gives the errors of a document it cannot open. */
const LOCKED_ERROR = 'PasswordException';
// pdf.js writes its own warnings to the console; the API journals only what it chooses to (ENF-SEC-08).
const SILENT = 0;

const SOFT_HYPHEN = /\u00AD/g;
// A word cut at a line end: « Dévelop-⏎pement ». A capital after the hyphen is a compound name (« Saint-⏎Denis »).
const HYPHENATED_WORD = /(\p{L})-\n(?=\p{Ll})/gu;

/** Rejoins the words hyphenated at a line end and drops soft hyphens; every other line break stays (EF-CVX-45). */
export const rejoinHyphenatedWords = (text: string): string =>
  text.replace(SOFT_HYPHEN, '').replace(HYPHENATED_WORD, '$1');

/**
 * Reads the text layer of each page of a PDF, in order, in memory. With a `textLayer` (poppler's `pdftotext`) the
 * columns come out in reading order; when it is absent or fails, or counts other pages than pdf.js, the text comes
 * from pdf.js itself, hyphenated words rejoined. A page made of an image only (a scan) gives an empty string: it is
 * for the OCR to read (EF-CVX-22).
 * @throws CvUnreadableError `locked` for a password-protected PDF, `damaged` for any other PDF it cannot open.
 * @req EF-CVX-21, EF-CVX-34, EF-CVX-45
 */
export const readPdfPages = async (
  pdf: Buffer,
  { textLayer }: { textLayer?: PdfTextLayer } = {},
): Promise<string[]> => {
  let document;
  try {
    // pdf.js takes ownership of the array it is given: a copy keeps the caller's buffer intact for the OCR.
    // ENF-SEC-22: the pdf.js bundled by unpdf (6.1) has no eval path at all, so a crafted font runs no code.
    document = await getDocumentProxy(new Uint8Array(pdf), { verbosity: SILENT });
  } catch (error) {
    throw new CvUnreadableError(error instanceof Error && error.name === LOCKED_ERROR ? 'locked' : 'damaged');
  }
  try {
    const { text } = await extractText(document, { mergePages: false });
    const fallback = text.map((page) => rejoinHyphenatedWords(page).trim());
    const layer = (await textLayer?.readPages(pdf)) ?? null;
    return layer?.length === fallback.length ? layer : fallback;
  } catch {
    throw new CvUnreadableError('damaged');
  } finally {
    // As unpdf does for the documents it opens itself: frees the worker-side copy of the PDF.
    await document.loadingTask.destroy();
  }
};
