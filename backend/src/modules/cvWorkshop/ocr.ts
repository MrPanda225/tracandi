import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CvUnreadableError } from './errors.js';

/** ENF-SEC-22: time a page may take, rendering and reading together. */
export const OCR_PAGE_TIMEOUT_MS = 60_000;
// 200 dpi in grey: sharp enough for body text, small enough for a 256 MB container (a page weighs about 3.7 MB).
const RENDER_DPI = '200';
const OCR_LANGUAGES = 'fra+eng';
const MAX_OUTPUT_BYTES = 1024 * 1024;
const OWNER_ONLY = 0o600;

/** Runs a program with a fixed list of arguments, never through a shell (ENF-SEC-22). */
export type CommandRunner = (
  file: string,
  args: readonly string[],
  options: { timeoutMs: number },
) => Promise<{ stdout: string }>;

/*
 * The programs get a bare environment: none of the API's secrets (database URL, keys) reaches them, and tesseract
 * runs on one thread, which keeps its memory within a small container.
 */
const commandEnvironment = (): NodeJS.ProcessEnv => ({ PATH: process.env['PATH'], OMP_THREAD_LIMIT: '1' });

/** The default runner: `execFile`, killed without mercy once its time is up. */
export const runWithExecFile: CommandRunner = (file, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: 'utf8',
        env: commandEnvironment(),
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve({ stdout });
      },
    );
  });

const isTimeout = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;

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
      const folder = await mkdtemp(join(tempRoot, 'tracandi-ocr-'));
      try {
        const pdfPath = join(folder, 'cv.pdf');
        await writeFile(pdfPath, pdf, { mode: OWNER_ONLY });
        const texts: string[] = [];
        // One page after the other: a 256 MB container holds a single rendering and reading at a time.
        for (const page of pageNumbers) texts.push(await readPage(folder, pdfPath, page));
        return texts;
      } catch (error) {
        if (error instanceof CvUnreadableError) throw error;
        throw new CvUnreadableError(isTimeout(error) ? 'ocrTooSlow' : 'ocrFailed');
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    },
  };
};
