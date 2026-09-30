import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdaptedCv } from '../../src/modules/cvWorkshop/adaptedCv.js';
import { renderAtsDocx } from '../../src/modules/cvWorkshop/atsDocx.js';
import { cvBlocks, densityFor, PAGE_DENSITIES, type PageDensity } from '../../src/modules/cvWorkshop/onePage.js';
import { FICTITIOUS_CONTACTS, longCv, TICKED_SKILLS } from '../fixtures/cv/longCv.js';

/*
 * RG-24 measured for real: the Word file is laid out by LibreOffice with Carlito, the metric twin of Calibri
 * (installed by the CI only — the API image does not need them), and the pages of the PDF are counted.
 */
const run = promisify(execFile);
const CONVERSION_TIMEOUT_MS = 120_000;
const MAX_SKILLS_TRIED = 400;

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'tracandi-one-page-it-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

/** Pages of the Word file once LibreOffice lays it out, and the fonts it used. */
const layOut = async (name: string, docx: Buffer): Promise<{ pages: number; fonts: string }> => {
  const source = join(workDir, `${name}.docx`);
  await writeFile(source, docx);
  await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', workDir, source], { timeout: CONVERSION_TIMEOUT_MS });
  const pdf = join(workDir, `${name}.pdf`);
  const { stdout: info } = await run('pdfinfo', [pdf]);
  const { stdout: fonts } = await run('pdffonts', [pdf]);
  return { pages: Number(/Pages:\s+(\d+)/.exec(info)?.[1]), fonts };
};

const densityOf = (cv: AdaptedCv, addedSkills: readonly string[]): PageDensity | null =>
  densityFor(cvBlocks({ cv, contacts: FICTITIOUS_CONTACTS, addedSkills }));

const rankOf = (density: PageDensity | null): number =>
  density === null ? PAGE_DENSITIES.length : PAGE_DENSITIES.indexOf(density);

/**
 * The most skills this CV takes while still set at this density — the fullest page the check of RG-24 lets through
 * there: one skill more would need a tighter setting, or none.
 */
const fullestSkillsAt = (cv: AdaptedCv, density: PageDensity): string[] => {
  const target = rankOf(density);
  let fullest: string[] = [];
  const skills: string[] = [];
  for (let index = 1; index <= MAX_SKILLS_TRIED; index += 1) {
    skills.push(`Compétence ${String(index)}`);
    const rank = rankOf(densityOf(cv, skills));
    if (rank > target) break;
    if (rank === target) fullest = [...skills];
  }
  return fullest;
};

describe('one A4 page, laid out by LibreOffice (RG-24)', () => {
  it(
    '[EF-CVX-36] writes the long fictitious CV, three skills ticked, on one page at 10 pt or more, its 12 experiences cited',
    async () => {
      expect(densityOf(longCv(1), TICKED_SKILLS)).not.toBeNull();

      const { pages, fonts } = await layOut('long', await renderAtsDocx({ cv: longCv(1), contacts: FICTITIOUS_CONTACTS, addedSkills: TICKED_SKILLS }));

      expect(fonts).toMatch(/Carlito/);
      expect(pages).toBe(1);
    },
    CONVERSION_TIMEOUT_MS,
  );

  it(
    '[RG-24] keeps on one page the fullest CV the check accepts, at every density',
    async () => {
      for (const [index, density] of PAGE_DENSITIES.entries()) {
        const cv = longCv(0);
        const skills = fullestSkillsAt(cv, density);
        expect(densityOf(cv, skills)).toBe(density);

        const { pages } = await layOut(`fullest-${String(index)}`, await renderAtsDocx({ cv, contacts: FICTITIOUS_CONTACTS, addedSkills: skills }));

        expect(pages, `density ${String(index)}`).toBe(1);
      }
    },
    CONVERSION_TIMEOUT_MS * PAGE_DENSITIES.length,
  );
});
