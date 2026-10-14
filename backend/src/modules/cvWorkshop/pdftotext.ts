import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CommandRunner, runWithExecFile, withPrivateFolder } from './command.js';
import type { Logger } from '../../lib/logger.js';

/** ENF-SEC-22: time `pdftotext` may take for a whole CV (it needs well under a second for a few pages). */
export const PDFTOTEXT_TIMEOUT_MS = 30_000;
const OWNER_ONLY = 0o600;
const FORM_FEED = '\f';

/** The text layer of a PDF as poppler's `pdftotext` reads it: columns put back in reading order (EF-CVX-45). */
export interface PdfTextLayer {
  /**
   * The text of each page, in page order, or `null` when `pdftotext` is absent, fails or runs out of time: the
   * caller then falls back on another reader. Never throws.
   */
  readPages: (pdf: Buffer) => Promise<string[] | null>;
}

/**
 * `pdftotext` in its default mode (neither `-layout` nor `-raw`): it orders the blocks of a page by column and rejoins
 * the words hyphenated at a line end. One call for the whole PDF, pages separated by form feeds. The PDF lives in a
 * private folder removed afterwards; the failure is journaled without any content (ENF-SEC-08, ENF-SEC-22).
 * @req EF-CVX-45, ENF-SEC-22
 */
export const createPdftotext = ({
  runCommand = runWithExecFile,
  tempRoot = tmpdir(),
  logger,
}: { runCommand?: CommandRunner; tempRoot?: string; logger?: Logger } = {}): PdfTextLayer => ({
  async readPages(pdf) {
    try {
      const { stdout } = await withPrivateFolder(tempRoot, 'tracandi-text-', async (folder) => {
        const pdfPath = join(folder, 'cv.pdf');
        await writeFile(pdfPath, pdf, { mode: OWNER_ONLY });
        return runCommand('pdftotext', ['-enc', 'UTF-8', '-eol', 'unix', pdfPath, '-'], {
          timeoutMs: PDFTOTEXT_TIMEOUT_MS,
        });
      });
      // Every page ends with a form feed: what follows the last one is no page.
      const pages = stdout.split(FORM_FEED);
      if (pages.length > 1 && pages[pages.length - 1]?.trim() === '') pages.pop();
      return pages.map((page) => page.trim());
    } catch (error) {
      logger?.warn('pdftotext failed, falling back on the pdf.js text layer', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    }
  },
});
