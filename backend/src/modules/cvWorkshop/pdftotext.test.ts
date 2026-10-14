import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandRunner } from './command.js';
import { createPdftotext, PDFTOTEXT_TIMEOUT_MS } from './pdftotext.js';

const PDF = Buffer.from('%PDF-1.4 fictitious', 'latin1');
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'tracandi-text-test-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('createPdftotext', () => {
  it('[EF-CVX-45] runs pdftotext once, in default mode, and splits the pages at the form feeds', async () => {
    const calls: { file: string; args: readonly string[]; timeoutMs: number }[] = [];
    const runCommand: CommandRunner = (file, args, { timeoutMs }) => {
      calls.push({ file, args, timeoutMs });
      return Promise.resolve({ stdout: 'Page un\n\f Page deux \n\f' });
    };

    const pages = await createPdftotext({ runCommand, tempRoot }).readPages(PDF);

    expect(pages).toEqual(['Page un', 'Page deux']);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.file).toBe('pdftotext');
    expect(calls[0]?.args).toEqual(['-enc', 'UTF-8', '-eol', 'unix', expect.stringMatching(/cv\.pdf$/), '-']);
    expect(calls[0]?.timeoutMs).toBe(PDFTOTEXT_TIMEOUT_MS);
  });

  it('[ENF-SEC-22] works in a private folder, removed afterwards, also after a failure', async () => {
    const failing: CommandRunner = () => Promise.reject(new Error('boom'));

    await createPdftotext({ runCommand: failing, tempRoot }).readPages(PDF);

    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('[EF-CVX-45] gives null and journals a warning without any content when pdftotext fails', async () => {
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn, error: vi.fn() };
    const failing: CommandRunner = () => Promise.reject(new Error('secret text of the CV'));

    const pages = await createPdftotext({ runCommand: failing, tempRoot, logger }).readPages(PDF);

    expect(pages).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret text');
  });
});
