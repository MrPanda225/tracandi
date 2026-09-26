import { HttpError } from '../../lib/errors.js';

/** EF-CVX-21: largest CV accepted, in bytes. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;

const BASE64_CHARS_PER_BLOCK = 4;
const BYTES_PER_BLOCK = 3;
/** Longest base64 text a CV of CV_MAX_BYTES can take, padding included. */
export const CV_MAX_BASE64_LENGTH = Math.ceil(CV_MAX_BYTES / BYTES_PER_BLOCK) * BASE64_CHARS_PER_BLOCK;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
// Every PDF starts with this signature, whatever the name of the file (ENF-SEC-22).
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');

/**
 * Turns the base64 content of an imported CV into its bytes, refusing it before any reading when it is too large
 * or is not a PDF. The size is checked on the text first, so that an oversized upload is never decoded.
 * @throws HttpError 413 beyond 5 MB; 400 when the content is not base64 or not a PDF (a DOCX included).
 * @req EF-CVX-21, ENF-SEC-22
 */
export const decodeCvUpload = (base64: string): Buffer => {
  if (base64.length > CV_MAX_BASE64_LENGTH) throw new HttpError(413, 'Le CV dépasse 5 Mo.');
  if (base64.length % BASE64_CHARS_PER_BLOCK !== 0 || !BASE64_PATTERN.test(base64)) {
    throw new HttpError(400, 'Le fichier du CV est mal transmis : importez-le à nouveau.');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > CV_MAX_BYTES) throw new HttpError(413, 'Le CV dépasse 5 Mo.');
  if (!bytes.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    throw new HttpError(400, 'Seul un CV au format PDF est accepté.');
  }
  return bytes;
};
