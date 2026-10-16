import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CommandRunner, isTimeout, runWithExecFile, withPrivateFolder } from './command.js';
import { CvUnreadableError } from './errors.js';

/** ENF-SEC-22: time a page may take, rendering and reading together. */
export const OCR_PAGE_TIMEOUT_MS = 60_000;
// 300 dpi in grey: what Tesseract recommends for small body text (EF-CVX-22); a page weighs about 8.4 MB, one at a time.
const RENDER_DPI = '300';
const OCR_LANGUAGES = 'fra+eng';
const OWNER_ONLY = 0o600;

/** Reads the text of the pages of a PDF that carry none (a scan), on this server (EF-CVX-22). */
export interface PdfOcr {
  /**
   * Renders each listed page (numbered from 1) in grey and reads it in French and English, in page order.
   * @throws CvUnreadableError `ocrTooSlow` when a page exceeds its 60 s, `ocrFailed` when a program fails.
   */
  readPages: (pdf: Buffer, pageNumbers: readonly number[]) => Promise<string[]>;
}

/**
 * Local OCR with `pdftoppm` (poppler) and `tesseract`: no image of the CV, which shows the candidate's contact
 * details, ever leaves the server (ENF-RGP-07). The PDF and its page images live in a private folder (0700) created
 * for this reading and removed when it ends, whatever the outcome (ENF-SEC-22).
 * @req EF-CVX-22, EF-CVX-34, ENF-SEC-22, ENF-RGP-06
 */
export const createPdfOcr = ({
  runCommand = runWithExecFile,
  tempRoot = tmpdir(),
}: { runCommand?: CommandRunner; tempRoot?: string } = {}): PdfOcr => {
  const readPage = async (folder: string, pdfPath: string, page: number): Promise<string> => {
    const startedAt = Date.now();
    const imagePrefix = join(folder, `page-${String(page)}`);
    const pageNumber = String(page);
    await runCommand(
      'pdftoppm',
      ['-f', pageNumber, '-l', pageNumber, '-r', RENDER_DPI, '-gray', '-singlefile', pdfPath, imagePrefix],
      { timeoutMs: OCR_PAGE_TIMEOUT_MS },
    );
    const remainingMs = Math.max(1, OCR_PAGE_TIMEOUT_MS - (Date.now() - startedAt));
    const { stdout } = await runCommand('tesseract', [`${imagePrefix}.pgm`, 'stdout', '-l', OCR_LANGUAGES], {
      timeoutMs: remainingMs,
    });
    return stdout.trim();
  };

  return {
    async readPages(pdf, pageNumbers) {
      try {
        return await withPrivateFolder(tempRoot, 'tracandi-ocr-', async (folder) => {
          const pdfPath = join(folder, 'cv.pdf');
          await writeFile(pdfPath, pdf, { mode: OWNER_ONLY });
          const texts: string[] = [];
          // One page after the other: a 256 MB container holds a single rendering and reading at a time.
          for (const page of pageNumbers) texts.push(await readPage(folder, pdfPath, page));
          return texts;
        });
      } catch (error) {
        if (error instanceof CvUnreadableError) throw error;
        throw new CvUnreadableError(isTimeout(error) ? 'ocrTooSlow' : 'ocrFailed');
      }
    },
  };
};
