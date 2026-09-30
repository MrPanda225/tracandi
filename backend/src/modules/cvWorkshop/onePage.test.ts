import { describe, expect, it } from 'vitest';
import { FICTITIOUS_CONTACTS, longCv, TICKED_SKILLS } from '../../../tests/fixtures/cv/longCv.js';
import { cvBlocks, densityFor, fitsOnOnePage, PAGE_DENSITIES } from './onePage.js';

const blocksOf = (bullets: number, addedSkills: readonly string[] = []) =>
  cvBlocks({ cv: longCv(bullets), contacts: FICTITIOUS_CONTACTS, addedSkills });

describe('one A4 page (RG-24)', () => {
  it('[RG-24] sets a short CV at the comfortable density: 11 pt, 2 cm margins', () => {
    const short = { ...longCv(1), experiences: longCv(1).experiences.slice(0, 2) };

    expect(densityFor(cvBlocks({ cv: short, contacts: FICTITIOUS_CONTACTS, addedSkills: [] }))).toEqual(PAGE_DENSITIES[0]);
  });

  it('[RG-24] tightens the page only as much as needed, never below 10 pt and 1.5 cm', () => {
    const density = densityFor(blocksOf(1));

    expect(density).not.toBeNull();
    expect(density?.bodyPt).toBeGreaterThanOrEqual(10);
    expect(density?.marginCm).toBeGreaterThanOrEqual(1.5);
    for (const each of PAGE_DENSITIES) {
      expect(each.bodyPt).toBeGreaterThanOrEqual(10);
      expect(each.marginCm).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('[RG-24] says that 12 experiences of 8 achievements do not hold on one page', () => {
    expect(densityFor(blocksOf(8))).toBeNull();
    expect(fitsOnOnePage({ cv: longCv(8), contacts: FICTITIOUS_CONTACTS, addedSkills: [] })).toBe(false);
  });

  it('[RG-24] counts the skills the candidate may still tick', () => {
    const manySkills = Array.from({ length: 20 }, (_unused, index) => `Compétence manquante numéro ${String(index + 1)}`);

    expect(fitsOnOnePage({ cv: longCv(1), contacts: FICTITIOUS_CONTACTS, addedSkills: TICKED_SKILLS })).toBe(true);
    // Twelve experiences without achievements: twenty skills more take the page to a tighter setting.
    expect(densityFor(blocksOf(0))).toEqual(PAGE_DENSITIES[0]);
    expect(densityFor(blocksOf(0, manySkills))).toEqual(PAGE_DENSITIES[1]);
  });

  it('[RG-22] [EF-CVX-28] lists the ticked skills once, after those of the CV', () => {
    const skills = blocksOf(0, ['SQL', 'Outil 1', 'dbt']).find((block) => block.kind === 'text' && block.text.startsWith('Outil 1,'));

    expect(skills?.text.endsWith('Outil 40, SQL, dbt')).toBe(true);
  });
});
