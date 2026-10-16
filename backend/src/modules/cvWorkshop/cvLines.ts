/** One non-blank line of the text of a CV, with the number the model points to (EF-CVX-46). */
export interface CvLine {
  /** 1-based, in reading order. */
  id: number;
  /** The line as written, trimmed. */
  text: string;
}

/** ENF-COU-01: a CV of three dense pages holds well under this; the lines beyond are left out. */
export const CV_LINES_MAX = 400;

/**
 * Numbers the non-blank lines of the text of a CV (contact details already taken out by `separateContacts`), from 1,
 * the first {@link CV_LINES_MAX} of them. The model points to these numbers and the code copies the text (RG-21).
 * @req EF-CVX-46, RG-21
 */
export const numberCvLines = (text: string): CvLine[] =>
  text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, CV_LINES_MAX)
    .map((line, index) => ({ id: index + 1, text: line }));
