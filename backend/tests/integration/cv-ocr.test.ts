import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPdfOcr } from '../../src/modules/cvWorkshop/ocr.js';
import { readCv } from '../../src/modules/cvWorkshop/reading.js';
import { buildScannedPdf, buildTextPdf, FICTITIOUS_CV_LINES, parsePgm } from '../fixtures/cv/pdf.js';

/*
 * The real OCR, as the API image runs it: poppler's pdftoppm and tesseract with its French and English data
 * (installed by the CI and the Dockerfile). The scanned CV is made here: a fictitious CV printed to a grey image,
 * then wrapped in a PDF that carries no text at all.
 */
const run = promisify(execFile);
const MEBIBYTE_KIB = 1024;
// The API container has 256 MB and Node takes about half: the reading of a page must stay well within the rest.
const MAX_OCR_MEMORY_MIB = 100;

let workDir: string;
let scannedCv: Buffer;
let pageImage: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tracandi-ocr-it-'));
  const printed = join(workDir, 'printed.pdf');
  await writeFile(printed, buildTextPdf([[...FICTITIOUS_CV_LINES]]));
  await run('pdftoppm', ['-r', '150', '-gray', '-singlefile', printed, join(workDir, 'printed')]);
  scannedCv = buildScannedPdf([parsePgm(await readFile(join(workDir, 'printed.pgm')))]);
  await run('pdftoppm', ['-r', '200', '-gray', '-singlefile', printed, join(workDir, 'page')]);
  pageImage = join(workDir, 'page.pgm');
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('OCR of a scanned CV', () => {
  it('[EF-CVX-22] reads the company and the job title of a scanned page, on this server', async () => {
    const tempRoot = await mkdtemp(join(workDir, 'ocr-'));

    const cv = await readCv(scannedCv, { ocr: createPdfOcr({ tempRoot }) });

    expect(cv.ocrPageCount).toBe(1);
    expect(cv.text).toMatch(/Atelier Nova/);
    expect(cv.text).toMatch(/Data Analyst/);
    // ENF-SEC-22: nothing of the CV is left on disk once it is read.
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it(`[EF-CVX-22] [EF-EXE-06] reads a page with less than ${String(MAX_OCR_MEMORY_MIB)} MiB of memory`, async () => {
    const { stderr } = await run('/usr/bin/time', ['-f', '%M', 'tesseract', pageImage, 'stdout', '-l', 'fra+eng'], {
      env: { PATH: process.env['PATH'], OMP_THREAD_LIMIT: '1' },
    });
    const peakKib = Number(stderr.trim().split('\n').at(-1));

    expect(peakKib / MEBIBYTE_KIB).toBeLessThan(MAX_OCR_MEMORY_MIB);
  });
});
