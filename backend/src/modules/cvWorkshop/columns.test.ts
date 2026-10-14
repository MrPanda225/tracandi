import { describe, expect, it, vi } from 'vitest';
import {
  buildGarbledCv,
  buildHyphenatedCv,
  buildTwoColumnCv,
  type ColumnsCv,
} from '../../../tests/fixtures/cv/columns.js';
import { createPdftotext } from './pdftotext.js';
import { readCv } from './reading.js';

// These tests run the real `pdftotext` (poppler), present on the machines and in the CI image like `pdftoppm`.
const textLayer = createPdftotext();
const ocr = { readPages: vi.fn(() => Promise.reject(new Error('ocr not expected'))) };

/** Ligatures are folded to plain letters (the way a model writes them) before looking for a fact. */
const readText = async (cv: ColumnsCv): Promise<string> =>
  (await readCv(cv.pdf, { ocr, textLayer })).text.normalize('NFKC');

const expectEveryFactWhole = (text: string, cv: ColumnsCv): void => {
  const { truth } = cv;
  const facts = [
    ...truth.titles,
    ...truth.organizations,
    ...truth.dates,
    ...truth.degrees,
    ...truth.schools,
    ...truth.skills,
    ...truth.bullets,
  ];
  for (const fact of facts) expect(text).toContain(fact);
};

describe('readCv on CVs laid out in columns', () => {
  it('[EF-CVX-45] reads a two-column CV whose stream interleaves the columns, every fact whole', async () => {
    const cv = buildTwoColumnCv();

    expectEveryFactWhole(await readText(cv), cv);
  });

  it('[EF-CVX-45] reads a job title wrapped over two lines without a word of the other column inside', async () => {
    const cv = buildTwoColumnCv({ wrapTitle: true });
    const text = await readText(cv);

    expect(text).toMatch(/Ingénieure\nDevOps\nNordwave Systems/);
    expect(text).toContain('09/2022 – 06/2024');
    expect(text).toContain('Master Informatique');
    expect(text).not.toMatch(/Master Informatique\S/);
  });

  it('[EF-CVX-45] keeps the bullet written on the same line as the address of the sidebar', async () => {
    const cv = buildTwoColumnCv({ addressOnBulletLine: true });
    const read = await readCv(cv.pdf, { ocr, textLayer });

    expect(read.text).toContain('Supervision Prometheus de 40 services.');
    expect(read.text).not.toContain('44000 Nantes');
    expect(read.contacts.address).toBe('3 rue des Pins, 44000 Nantes');
  });

  it('[ENF-RGP-07] still extracts the contact details of a two-column CV', async () => {
    const { contacts, text } = await readCv(buildTwoColumnCv().pdf, { ocr, textLayer });

    expect(contacts).toMatchObject({
      name: 'Lucie Marchand',
      emails: ['lucie.marchand@example.com'],
      phones: ['06 12 34 56 78'],
    });
    expect(text).not.toContain('lucie.marchand@example.com');
  });

  it.each([
    ['a hyphen', false],
    ['a soft hyphen', true],
  ])(
    '[EF-CVX-45] rejoins « Développement » cut by %s at a line end, ligatures folded',
    async (_name, softHyphen) => {
      const cv = buildHyphenatedCv({ softHyphen });
      const text = await readText(cv);

      expectEveryFactWhole(text, cv);
      expect(text).not.toMatch(/Dévelop[-­]?\n/);
    },
  );

  it('[EF-CVX-45] falls back on the pdf.js text, hyphenated words rejoined too, when pdftotext is not there', async () => {
    const missing = createPdftotext({ runCommand: () => Promise.reject(new Error('ENOENT')) });
    const cv = buildHyphenatedCv({ softHyphen: false });

    const text = (await readCv(cv.pdf, { ocr, textLayer: missing })).text.normalize('NFKC');

    expect(text).toContain('Développement');
    expect(text.split('\n').length).toBeGreaterThan(3);
  });

  it('[EF-CVX-22] sends a page whose text layer is garbage to the OCR like a scan', async () => {
    const readPages = vi.fn((_pdf: Buffer, pages: readonly number[]) =>
      Promise.resolve(pages.map(() => 'Lucie Marchand\nIngénieure DevOps chez Nordwave Systems depuis 2022')),
    );
    const pdf = buildGarbledCv();

    const cv = await readCv(pdf, { ocr: { readPages }, textLayer });

    expect(readPages).toHaveBeenCalledWith(pdf, [1]);
    expect(cv.ocrPageCount).toBe(1);
    expect(cv.text).toContain('Nordwave Systems');
  });
});
