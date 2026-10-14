import { type CvContacts, separateContacts } from './contacts.js';
import { CvUnreadableError } from './errors.js';
import type { PdfOcr } from './ocr.js';
import { readPdfPages } from './pdfText.js';
import type { PdfTextLayer } from './pdftotext.js';

/** EF-CVX-22: pages the OCR reads at most, a scanned CV rarely having more. */
export const MAX_OCR_PAGES = 3;
// Below this many letters or digits, a page carries no real text layer (a scan, or a stray page number).
const MIN_PAGE_CHARS = 20;
// Below this, what was read is no CV (a blank scan, noise).
const MIN_CV_CHARS = 40;

// EF-CVX-22: a text layer in which this share of the characters are private-use or replacement characters (a font
// without a usable encoding) is garbage: the page goes to the OCR like a scan. Icon bullets stay far below it.
export const GARBLED_LAYER_SHARE = 0.05;

/** ENF-SEC-22: the text kept of a CV, whatever the PDF holds — a CV of three pages has a tenth of that. */
export const MAX_CV_TEXT_CHARS = 60_000;

/** An imported CV once read: its text without the contact details, and those details (ENF-RGP-07). */
export interface ReadCv {
  text: string;
  contacts: CvContacts;
  /** How many pages had to be read by OCR (for the progress shown and ENF-PERF-08). */
  ocrPageCount: number;
}

const meaningfulLength = (text: string): number => text.replace(/[^\p{L}\p{N}]/gu, '').length;

const GARBAGE_CHARACTER = /[\p{Co}\uFFFD]/gu;

const isGarbled = (text: string): boolean => {
  const garbage = text.match(GARBAGE_CHARACTER)?.length ?? 0;
  return garbage > 0 && garbage / (meaningfulLength(text) + garbage) > GARBLED_LAYER_SHARE;
};

/**
 * Reads an imported PDF CV in memory: its text layer, then, by OCR on this server, the pages that carry none — three
 * at most (a garbled text layer counts as no text). Contact details are taken out of the text and kept aside. Nothing is sent to any AI provider here.
 * @throws CvUnreadableError when the PDF is locked or damaged, has more than 3 pages without text, or yields no
 * text at all (EF-CVX-34).
 * @req EF-CVX-21, EF-CVX-22, EF-CVX-34, EF-CVX-45, ENF-RGP-07
 */
export const readCv = async (
  pdf: Buffer,
  { ocr, textLayer }: { ocr: PdfOcr; textLayer?: PdfTextLayer },
): Promise<ReadCv> => {
  const pages = await readPdfPages(pdf, { textLayer });
  const scanned = pages.flatMap((text, index) =>
    meaningfulLength(text) < MIN_PAGE_CHARS || isGarbled(text) ? [index + 1] : [],
  );
  if (scanned.length > MAX_OCR_PAGES) throw new CvUnreadableError('tooManyScannedPages');
  const ocrTexts = scanned.length > 0 ? await ocr.readPages(pdf, scanned) : [];
  const fullText = pages
    .map((text, index) => {
      const ocrIndex = scanned.indexOf(index + 1);
      return ocrIndex === -1 ? text : (ocrTexts[ocrIndex] ?? '');
    })
    .join('\n')
    .trim()
    .slice(0, MAX_CV_TEXT_CHARS);
  if (meaningfulLength(fullText) < MIN_CV_CHARS) throw new CvUnreadableError('noText');
  return { ...separateContacts(fullText), ocrPageCount: scanned.length };
};
