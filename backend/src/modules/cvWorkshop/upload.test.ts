import { describe, expect, it } from 'vitest';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { CV_MAX_BYTES, decodeCvUpload } from './upload.js';

const base64Of = (bytes: Buffer): string => bytes.toString('base64');
/** A PDF padded to an exact size: readers ignore what follows the end of the file. */
const pdfOfSize = (size: number): Buffer => {
  const pdf = buildTextPdf([[...FICTITIOUS_CV_LINES]]);
  return Buffer.concat([pdf, Buffer.alloc(size - pdf.length, 0x20)]);
};

describe('decodeCvUpload', () => {
  it('[EF-CVX-21] accepts a PDF of exactly 5 MB', () => {
    const pdf = pdfOfSize(CV_MAX_BYTES);

    expect(decodeCvUpload(base64Of(pdf)).equals(pdf)).toBe(true);
  });

  it('[EF-CVX-21] [ENF-SEC-22] refuses a file of 5 MB and one byte, before reading it', () => {
    expect(() => decodeCvUpload(base64Of(pdfOfSize(CV_MAX_BYTES + 1)))).toThrow(
      expect.objectContaining({ statusCode: 413, message: 'Le CV dépasse 5 Mo.' }) as Error,
    );
  });

  it('[EF-CVX-21] refuses a DOCX, whatever the name the candidate gave it', () => {
    const docx = Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(200, 0)]);

    expect(() => decodeCvUpload(base64Of(docx))).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Seul un CV au format PDF est accepté.' }) as Error,
    );
  });

  it('[EF-CVX-21] [ENF-SEC-22] refuses a text file posing as a PDF', () => {
    expect(() => decodeCvUpload(base64Of(Buffer.from('Ceci est un CV.pdf', 'utf8')))).toThrow(
      expect.objectContaining({ statusCode: 400 }) as Error,
    );
  });

  it('[ENF-SEC-04] refuses content that is not base64', () => {
    expect(() => decodeCvUpload('pas du base64 !')).toThrow(expect.objectContaining({ statusCode: 400 }) as Error);
  });
});
