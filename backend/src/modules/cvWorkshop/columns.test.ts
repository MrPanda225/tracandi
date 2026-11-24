import { describe, expect, it, vi } from 'vitest';
import {
  buildDateMarginCv,
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

/** Each text comes after the one before it in `text`, every one of them present. */
const expectInOrder = (text: string, parts: readonly string[]): void => {
  const positions = parts.map((part) => text.indexOf(part));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((first, second) => first - second));
};

/** The text read between two parts of the CV. */
const between = (text: string, from: string, to: string): string =>
  text.slice(text.indexOf(from) + from.length, text.indexOf(to));

describe('readCv on CVs laid out in columns', () => {
  it('[EF-CVX-45] reads a two-column CV whose stream interleaves the columns, every fact whole', async () => {
    const cv = buildTwoColumnCv();

    expectEveryFactWhole(await readText(cv), cv);
  });

  it.each([
    ['side by side', {}],
    ['with its address on the row of a bullet', { addressOnBulletLine: true }],
    ['with a wrapped job title', { wrapTitle: true }],
  ])('[EF-CVX-45] reads each bullet right after its job, in a two-column CV %s', async (_name, options) => {
    const text = await readText(buildTwoColumnCv(options));

    expectInOrder(text, [
      'EXPERIENCES PROFESSIONNELLES',
      'Nordwave Systems, Nantes',
      '09/2022 – 06/2024',
      'Automatisation des déploiements avec GitLab CI.',
      'Supervision Prometheus de 40 services.',
      'Technicienne systèmes',
      'Atelier Brume, Rennes',
      '2020 – 2022',
      'Administration de serveurs Linux.',
      'FORMATION',
      'Master Informatique',
      'Université de Rennes, Rennes',
      '2018 – 2020',
    ]);
    const firstJob = between(text, 'EXPERIENCES PROFESSIONNELLES', 'FORMATION');
    for (const sidebar of ['CONTACT', 'COMPETENCES', 'Docker', 'Kubernetes', 'Terraform', 'Python']) {
      expect(firstJob).not.toContain(sidebar);
    }
    expectInOrder(text, ['COMPETENCES', 'Docker', 'Kubernetes', 'Terraform', 'Python']);
  });

  it('[EF-CVX-45] keeps each date of a margin with its job in a one-column CV', async () => {
    const cv = buildDateMarginCv();
    const text = await readText(cv);

    expectEveryFactWhole(text, cv);
    expectInOrder(text, [
      '09/2022 – 06/2024',
      'Ingénieure DevOps',
      'Supervision Prometheus de 40 services.',
      '2020 – 2022',
      'Technicienne systèmes',
      'Administration de serveurs Linux.',
    ]);
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
