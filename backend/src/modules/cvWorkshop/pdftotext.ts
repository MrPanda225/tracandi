import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CommandRunner, runWithExecFile, withPrivateFolder } from './command.js';
import { parseBboxLayout, readingRegions, type Region } from './columnLayout.js';
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

const TEXT_ARGS = ['-enc', 'UTF-8', '-eol', 'unix'] as const;

/** Pages of a `pdftotext` output: every page ends with a form feed, what follows the last one is no page. */
const splitPages = (stdout: string): string[] => {
  const pages = stdout.split(FORM_FEED);
  if (pages.length > 1 && pages[pages.length - 1]?.trim() === '') pages.pop();
  return pages.map((page) => page.trim());
};

interface PdfCall {
  runCommand: CommandRunner;
  pdfPath: string;
}

const run = ({ runCommand, pdfPath }: PdfCall, options: readonly string[]): Promise<string> =>
  runCommand('pdftotext', [...options, pdfPath, '-'], { timeoutMs: PDFTOTEXT_TIMEOUT_MS }).then(
    ({ stdout }) => stdout,
  );

/** The text of one area of one page (pages numbered from 1). */
const readRegion = async (call: PdfCall, page: number, region: Region): Promise<string> => {
  const pages = ['-f', String(page), '-l', String(page)];
  const crop = ['-x', String(region.x), '-y', String(region.y), '-W', String(region.width), '-H', String(region.height)];
  return (await run(call, [...TEXT_ARGS, ...pages, ...crop])).replaceAll(FORM_FEED, '').trim();
};

/**
 * EF-CVX-45: the pages read again column by column where `-bbox-layout` shows side-by-side columns, the other pages
 * kept as the default mode read them. The areas are read one after the other, so a long CV never runs many programs
 * at once.
 */
const inReadingOrder = async (call: PdfCall, pages: readonly string[]): Promise<string[]> => {
  const layouts = parseBboxLayout(await run(call, ['-bbox-layout']));
  if (layouts.length !== pages.length) return [...pages];
  const ordered: string[] = [];
  for (const [index, layout] of layouts.entries()) {
    const regions = readingRegions(layout);
    const texts: string[] = [];
    for (const region of regions ?? []) texts.push(await readRegion(call, index + 1, region));
    ordered.push(regions ? texts.filter((text) => text !== '').join('\n\n') : (pages[index] ?? ''));
  }
  return ordered;
};

/**
 * `pdftotext` in its default mode (neither `-layout` nor `-raw`), which rejoins the words hyphenated at a line end;
 * one call for the whole PDF, pages separated by form feeds. Its order of the blocks mixes side-by-side columns line
 * by line, so the geometry of the lines (`-bbox-layout`) is read too and a page in columns is read again column by
 * column (EF-CVX-45); when that geometry cannot be read, the default text is kept. The PDF lives in a private folder
 * removed afterwards; a failure is journaled without any content (ENF-SEC-08, ENF-SEC-22).
 * @req EF-CVX-45, ENF-SEC-22
 */
export const createPdftotext = ({
  runCommand = runWithExecFile,
  tempRoot = tmpdir(),
  logger,
}: { runCommand?: CommandRunner; tempRoot?: string; logger?: Logger } = {}): PdfTextLayer => ({
  async readPages(pdf) {
    try {
      return await withPrivateFolder(tempRoot, 'tracandi-text-', async (folder) => {
        const call = { runCommand, pdfPath: join(folder, 'cv.pdf') };
        await writeFile(call.pdfPath, pdf, { mode: OWNER_ONLY });
        const pages = splitPages(await run(call, TEXT_ARGS));
        try {
          return await inReadingOrder(call, pages);
        } catch (error) {
          logger?.warn('pdftotext could not read the columns, default reading order kept', {
            reason: error instanceof Error ? error.name : 'unknown',
          });
          return pages;
        }
      });
    } catch (error) {
      logger?.warn('pdftotext failed, falling back on the pdf.js text layer', {
        reason: error instanceof Error ? error.name : 'unknown',
      });
      return null;
    }
  },
});
