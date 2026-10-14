import { describe, expect, it, vi } from 'vitest';
import {
  blankImage,
  buildMixedPdf,
  buildScannedPdf,
  buildTextPdf,
  FICTITIOUS_CV_LINES,
} from '../../../tests/fixtures/cv/pdf.js';
import { createPdftotext } from './pdftotext.js';
import { MAX_CV_TEXT_CHARS, MAX_OCR_PAGES, readCv } from './reading.js';

const fakeOcr = (texts: (page: number) => string = () => [...FICTITIOUS_CV_LINES].join('\n')) => ({
  readPages: vi.fn((_pdf: Buffer, pages: readonly number[]) => Promise.resolve(pages.map(texts))),
});

describe('readCv', () => {
  it('[EF-CVX-21] [ENF-RGP-07] reads a PDF with text, without OCR, and keeps the contact details aside', async () => {
    const ocr = fakeOcr();

    const cv = await readCv(buildTextPdf([[...FICTITIOUS_CV_LINES]]), { ocr });

    expect(ocr.readPages).not.toHaveBeenCalled();
    expect(cv.ocrPageCount).toBe(0);
    expect(cv.text).toContain('Data Analyst - Atelier Nova');
    expect(cv.text).not.toContain('camille.durand@example.com');
    expect(cv.contacts.name).toBe('Camille Durand');
  });

  it('[ENF-SEC-22] keeps at most 60 000 characters of a PDF that holds far more than a CV, and still reads it', async () => {
    const lines = Array.from(
      { length: 2000 },
      (_unused, index) =>
        `Ligne ${String(index)} : du texte ordinaire pour remplir la page de ce CV démesuré`,
    );

    const cv = await readCv(buildTextPdf([lines]), { ocr: fakeOcr() });

    expect(cv.text.length).toBeLessThanOrEqual(MAX_CV_TEXT_CHARS);
    expect(cv.text).toContain('Ligne 0');
  });

  it('[EF-CVX-22] reads by OCR only the pages that carry no text', async () => {
    const ocr = fakeOcr(() => 'COMPETENCES\nSQL, Python, Power BI, Tableau, dbt et Airflow');
    const pdf = buildMixedPdf([...FICTITIOUS_CV_LINES], blankImage());

    const cv = await readCv(pdf, { ocr });

    expect(ocr.readPages).toHaveBeenCalledWith(pdf, [2]);
    expect(cv.ocrPageCount).toBe(1);
    expect(cv.text).toContain('Atelier Nova');
    expect(cv.text).toContain('dbt et Airflow');
  });

  it(`[EF-CVX-34] refuses a scan of more than ${MAX_OCR_PAGES} pages, without reading any`, async () => {
    const ocr = fakeOcr();
    const scan = buildScannedPdf(Array.from({ length: MAX_OCR_PAGES + 1 }, () => blankImage()));

    await expect(readCv(scan, { ocr })).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('3 pages') as string,
    });
    expect(ocr.readPages).not.toHaveBeenCalled();
  });

  it('[EF-CVX-34] refuses a CV in which even OCR finds no text', async () => {
    await expect(
      readCv(buildScannedPdf([blankImage()]), { ocr: fakeOcr(() => '  \n ') }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('aucun texte') as string,
    });
  });

  it('[EF-CVX-45] reads the text from pdf.js when pdftotext fails', async () => {
    const textLayer = createPdftotext({ runCommand: () => Promise.reject(new Error('absent')) });

    const cv = await readCv(buildTextPdf([[...FICTITIOUS_CV_LINES]]), { ocr: fakeOcr(), textLayer });

    expect(cv.text).toContain('Data Analyst - Atelier Nova');
  });

  it('[EF-CVX-45] reads the text from pdf.js when pdftotext counts other pages than the document', async () => {
    const textLayer = { readPages: () => Promise.resolve(['one', 'two', 'three']) };

    const cv = await readCv(buildTextPdf([[...FICTITIOUS_CV_LINES]]), { ocr: fakeOcr(), textLayer });

    expect(cv.text).toContain('Data Analyst - Atelier Nova');
  });

  it('[EF-CVX-22] sends to the OCR a page whose text layer is mostly private-use characters', async () => {
    const garbage = '\uF0E0'.repeat(30);
    const textLayer = {
      readPages: () =>
        Promise.resolve([`${[...FICTITIOUS_CV_LINES].join('\n')}\n\uF0E0`, `${garbage} ab`]),
    };
    const ocr = fakeOcr(() => 'COMPETENCES\nSQL, Python, Power BI, Tableau, dbt et Airflow');

    const cv = await readCv(buildTextPdf([[...FICTITIOUS_CV_LINES], [...FICTITIOUS_CV_LINES]]), {
      ocr,
      textLayer,
    });

    expect(ocr.readPages).toHaveBeenCalledWith(expect.anything(), [2]);
    expect(cv.text).toContain('dbt et Airflow');
  });

  it('[EF-CVX-22] keeps a text layer with a few icon glyphs among real words', async () => {
    const ocr = fakeOcr();
    const textLayer = { readPages: () => Promise.resolve([`\uF0E0 ${[...FICTITIOUS_CV_LINES].join('\n')}`]) };

    await readCv(buildTextPdf([[...FICTITIOUS_CV_LINES]]), { ocr, textLayer });

    expect(ocr.readPages).not.toHaveBeenCalled();
  });
});
