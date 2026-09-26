import { describe, expect, it, vi } from 'vitest';
import {
  blankImage,
  buildMixedPdf,
  buildScannedPdf,
  buildTextPdf,
  FICTITIOUS_CV_LINES,
} from '../../../tests/fixtures/cv/pdf.js';
import { MAX_OCR_PAGES, readCv } from './reading.js';

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
    await expect(readCv(buildScannedPdf([blankImage()]), { ocr: fakeOcr(() => '  \n ') })).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('aucun texte') as string,
    });
  });
});

