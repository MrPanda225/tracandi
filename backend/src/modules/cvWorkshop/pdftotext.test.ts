import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandRunner } from './command.js';
import { createPdftotext, MAX_COLUMN_PAGES, PDFTOTEXT_TIMEOUT_MS } from './pdftotext.js';

const PDF = Buffer.from('%PDF-1.4 fictitious', 'latin1');

const line = (xMin: number, yMin: number, xMax: number): string =>
  `<line xMin="${xMin}" yMin="${yMin}" xMax="${xMax}" yMax="${yMin + 9}">`;
/** Page 1: a sidebar and a main column whose rows never meet; page 2: a single column. */
const TWO_COLUMNS_THEN_ONE = [
  '<page width="595.000000" height="842.000000">',
  ...[100, 125, 150, 175].map((y) => line(40, y, 177)),
  ...[110, 135, 160, 185].map((y) => line(215, y, 440)),
  '</page><page width="595.000000" height="842.000000">',
  ...[100, 116, 132, 148].map((y) => line(50, y, 540)),
  '</page>',
].join('\n');
let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'tracandi-text-test-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('createPdftotext', () => {
  it('[EF-CVX-45] reads the PDF in default mode, splits the pages at the form feeds, then reads its layout', async () => {
    const calls: { file: string; args: readonly string[]; timeoutMs: number }[] = [];
    const runCommand: CommandRunner = (file, args, { timeoutMs }) => {
      calls.push({ file, args, timeoutMs });
      return Promise.resolve({ stdout: args.includes('-bbox-layout') ? '' : 'Page un\n\f Page deux \n\f' });
    };

    const pages = await createPdftotext({ runCommand, tempRoot }).readPages(PDF);

    expect(pages).toEqual(['Page un', 'Page deux']);
    expect(calls.map((call) => call.file)).toEqual(['pdftotext', 'pdftotext']);
    expect(calls[0]?.args).toEqual(['-enc', 'UTF-8', '-eol', 'unix', expect.stringMatching(/cv\.pdf$/), '-']);
    expect(calls[1]?.args).toEqual(['-bbox-layout', '-l', '5', expect.stringMatching(/cv\.pdf$/), '-']);
    expect(calls.every((call) => call.timeoutMs === PDFTOTEXT_TIMEOUT_MS)).toBe(true);
  });

  it('[EF-CVX-45] reads a page in two columns again, column by column, and keeps a page in one column', async () => {
    const crops: string[][] = [];
    const runCommand: CommandRunner = (_file, args) => {
      if (args.includes('-bbox-layout')) return Promise.resolve({ stdout: TWO_COLUMNS_THEN_ONE });
      if (args.includes('-x')) {
        crops.push([...args]);
        return Promise.resolve({ stdout: args[args.indexOf('-x') + 1] === '0' ? 'Gauche\n\f' : 'Droite\n\f' });
      }
      return Promise.resolve({ stdout: 'Gauche Droite mêlées\n\fPage simple\n\f' });
    };

    const pages = await createPdftotext({ runCommand, tempRoot }).readPages(PDF);

    expect(pages).toEqual(['Gauche\n\nDroite', 'Page simple']);
    expect(crops).toHaveLength(2);
    expect(crops[0]).toEqual(
      expect.arrayContaining(['-f', '1', '-l', '1', '-x', '0', '-y', '0', '-W', '196', '-H', '842']),
    );
    expect(crops[1]).toEqual(expect.arrayContaining(['-x', '196', '-W', '399']));
  });

  it('[ENF-SEC-22] reads again in columns the first 5 pages at most, the pages beyond kept as read', async () => {
    const page = TWO_COLUMNS_THEN_ONE.split('</page>')[0] ?? '';
    const crops: string[][] = [];
    const runCommand: CommandRunner = (_file, args) => {
      if (args.includes('-bbox-layout')) {
        const last = Number(args[args.indexOf('-l') + 1]);
        return Promise.resolve({ stdout: Array.from({ length: Math.min(7, last) }, () => `${page}</page>`).join('\n') });
      }
      if (args.includes('-x')) {
        crops.push([...args]);
        return Promise.resolve({ stdout: 'Colonne\n\f' });
      }
      return Promise.resolve({ stdout: Array.from({ length: 7 }, (_unused, index) => `Page ${String(index + 1)}\n\f`).join('') });
    };

    const pages = await createPdftotext({ runCommand, tempRoot }).readPages(PDF);

    expect(MAX_COLUMN_PAGES).toBe(5);
    expect(crops).toHaveLength(2 * MAX_COLUMN_PAGES);
    expect(new Set(crops.map((args) => args[args.indexOf('-f') + 1]))).toEqual(new Set(['1', '2', '3', '4', '5']));
    expect(pages?.slice(5)).toEqual(['Page 6', 'Page 7']);
    expect(pages?.[0]).toBe('Colonne\n\nColonne');
  });

  it('[EF-CVX-45] keeps the default reading order, and journals no content, when the layout cannot be read', async () => {
    const warn = vi.fn();
    const logger = { info: vi.fn(), warn, error: vi.fn() };
    const runCommand: CommandRunner = (_file, args) =>
      args.includes('-bbox-layout')
        ? Promise.reject(new Error('stdout maxBuffer length exceeded: secret text of the CV'))
        : Promise.resolve({ stdout: 'Texte du CV\n\f' });

    const pages = await createPdftotext({ runCommand, tempRoot, logger }).readPages(PDF);

    expect(pages).toEqual(['Texte du CV']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret text');
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
