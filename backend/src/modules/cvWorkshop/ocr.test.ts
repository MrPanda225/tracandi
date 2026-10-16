import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CommandRunner } from './command.js';
import { createPdfOcr, OCR_PAGE_TIMEOUT_MS } from './ocr.js';

const PDF = Buffer.from('%PDF-1.4 fictitious', 'latin1');
let tempRoot: string;

interface Call {
  file: string;
  args: readonly string[];
  timeoutMs: number;
}

/** A runner that answers like pdftoppm and tesseract, and remembers what it was asked. */
const recordingRunner = (calls: Call[], text: (page: string) => string = (page) => `texte de la page ${page}`) => {
  const runner: CommandRunner = async (file, args, { timeoutMs }) => {
    calls.push({ file, args, timeoutMs });
    if (file === 'pdftoppm') return { stdout: '' };
    const image = args[0] ?? '';
    return { stdout: text(/page-(\d+)/.exec(image)?.[1] ?? '?') };
  };
  return runner;
};

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'tracandi-ocr-test-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('createPdfOcr', () => {
  it('[EF-CVX-22] renders each page in grey, then reads it in French and English, in page order', async () => {
    const calls: Call[] = [];
    const ocr = createPdfOcr({ runCommand: recordingRunner(calls), tempRoot });

    const texts = await ocr.readPages(PDF, [2, 3]);

    expect(texts).toEqual(['texte de la page 2', 'texte de la page 3']);
    expect(calls.map((call) => call.file)).toEqual(['pdftoppm', 'tesseract', 'pdftoppm', 'tesseract']);
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining(['-f', '2', '-l', '2', '-gray', '-singlefile', '-r', '300']),
    );
    expect(calls[1]?.args).toEqual([expect.stringMatching(/page-2\.pgm$/), 'stdout', '-l', 'fra+eng']);
  });

  it('[ENF-SEC-22] works in a private folder, removed once the reading is over', async () => {
    const seen: { mode: number; files: string[] }[] = [];
    const runner: CommandRunner = async (file, args, options) => {
      if (file === 'pdftoppm') {
        const folder = join(args.at(-2) ?? '', '..');
        seen.push({ mode: (await stat(folder)).mode & 0o777, files: await readdir(folder) });
      }
      return recordingRunner([])(file, args, options);
    };

    await createPdfOcr({ runCommand: runner, tempRoot }).readPages(PDF, [1]);

    expect(seen[0]).toEqual({ mode: 0o700, files: ['cv.pdf'] });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('[ENF-SEC-22] removes the folder after a failure too', async () => {
    const failing: CommandRunner = () => Promise.reject(new Error('tesseract crashed'));

    await expect(createPdfOcr({ runCommand: failing, tempRoot }).readPages(PDF, [1])).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('[ENF-SEC-22] gives each page at most 60 seconds, all commands included', async () => {
    const calls: Call[] = [];

    await createPdfOcr({ runCommand: recordingRunner(calls), tempRoot }).readPages(PDF, [1]);

    expect(OCR_PAGE_TIMEOUT_MS).toBe(60_000);
    for (const call of calls) expect(call.timeoutMs).toBeLessThanOrEqual(OCR_PAGE_TIMEOUT_MS);
  });

  it('[EF-CVX-34] tells the candidate when a page took too long to read', async () => {
    const tooSlow: CommandRunner = () =>
      Promise.reject(Object.assign(new Error('killed'), { killed: true, signal: 'SIGKILL' }));

    await expect(createPdfOcr({ runCommand: tooSlow, tempRoot }).readPages(PDF, [1])).rejects.toMatchObject({
      statusCode: 422,
      message: expect.stringContaining('trop de temps') as string,
    });
  });
});
