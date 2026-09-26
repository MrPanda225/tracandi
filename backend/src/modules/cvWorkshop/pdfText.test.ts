import { describe, expect, it } from 'vitest';
import { blankImage, buildLockedPdf, buildScannedPdf, buildTextPdf } from '../../../tests/fixtures/cv/pdf.js';
import { readPdfPages } from './pdfText.js';

describe('readPdfPages', () => {
  it('[EF-CVX-21] reads the text of each page, in order', async () => {
    const pages = await readPdfPages(buildTextPdf([['Data Analyst', 'Atelier Nova'], ['Formation']]));

    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain('Atelier Nova');
    expect(pages[1]).toContain('Formation');
  });

  it('[EF-CVX-22] gives an empty text for a page made of an image', async () => {
    expect(await readPdfPages(buildScannedPdf([blankImage()]))).toEqual(['']);
  });

  it('[EF-CVX-34] refuses a PDF locked by a password, saying so', async () => {
    await expect(readPdfPages(buildLockedPdf(['Secret']))).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('protégé par un mot de passe') as string,
    });
  });

  it('[EF-CVX-34] refuses a damaged PDF, saying so', async () => {
    const damaged = Buffer.concat([Buffer.from('%PDF-1.4\n', 'latin1'), Buffer.alloc(300, 0x41)]);

    await expect(readPdfPages(damaged)).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('endommagé') as string,
    });
  });
});
