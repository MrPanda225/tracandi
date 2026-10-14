import { describe, expect, it } from 'vitest';
import { FICTITIOUS_CONTACTS, longCv, TICKED_SKILLS } from '../../../tests/fixtures/cv/longCv.js';
import type { AdaptedCv } from './adaptedCv.js';
import { cvBlocks, densityFor, fitsOnOnePage, fitToOnePage, PAGE_DENSITIES } from './onePage.js';

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

  it('[RG-24] [EF-CVX-47] leaves out of an entry line what the CV does not give, with its separator', () => {
    const cv: AdaptedCv = {
      ...longCv(0),
      experiences: [{ title: 'Développeuse', organization: null, place: null, dates: null, bullets: [] }],
      education: [{ degree: 'Licence', school: null, place: null, dates: '2012', detail: null }],
    };

    const entries = cvBlocks({ cv, contacts: FICTITIOUS_CONTACTS, addedSkills: [] })
      .filter((block) => block.kind === 'entry')
      .map((block) => block.text);

    expect(entries).toEqual(['Développeuse', 'Licence | 2012']);
  });
});

describe('fitToOnePage (RG-24)', () => {
  const fit = { contacts: FICTITIOUS_CONTACTS, addedSkills: [] as string[] };
  const bulletsOf = (cv: AdaptedCv): number[] => cv.experiences.map((experience) => experience.bullets.length);

  it('[RG-24] returns a CV that already fits as it is', () => {
    const cv = longCv(1);

    expect(fitToOnePage(cv, fit)).toBe(cv);
  });

  it('[RG-24] [EF-CVX-47] trims the bullets from the oldest experience, its last bullet first, until it fits; every line stays', () => {
    const cv = longCv(4);

    const trimmed = fitToOnePage(cv, fit);

    expect(trimmed).not.toBeNull();
    expect(fitsOnOnePage({ cv: trimmed as AdaptedCv, ...fit })).toBe(true);
    const counts = bulletsOf(trimmed as AdaptedCv);
    expect(counts.reduce((total, count) => total + count, 0)).toBeLessThan(48);
    // Oldest first: counts never increase from the newest to the oldest experience.
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(trimmed?.experiences.map((experience) => experience.organization)).toEqual(cv.experiences.map((experience) => experience.organization));
    expect(trimmed?.education).toHaveLength(2);
  });

  it('[RG-24] removes as few bullets as it takes', () => {
    const trimmed = fitToOnePage(longCv(4), fit) as AdaptedCv;
    const oneMore = {
      ...trimmed,
      experiences: trimmed.experiences.map((experience, index) =>
        index === trimmed.experiences.findLastIndex((item) => item.bullets.length < 4)
          ? { ...experience, bullets: [...experience.bullets, 'Conception et suivi de tableaux de bord Power BI pour les équipes commerciales de la région.'] }
          : experience,
      ),
    };

    expect(fitsOnOnePage({ cv: oneMore, ...fit })).toBe(false);
  });

  it('[RG-24] then drops the last sentences of the profile, keeping the first, then the education details', () => {
    const cv: AdaptedCv = {
      ...longCv(0),
      profile: 'Première phrase. '.repeat(1) + 'Une phrase qui occupe de la place sur la page. '.repeat(30),
      education: longCv(0).education.map((entry) => ({ ...entry, detail: 'Mention très bien avec les félicitations du jury. '.repeat(14) })),
      skills: Array.from({ length: 60 }, (_unused, index) => `Outil numéro ${String(index + 1)}`),
    };
    expect(fitsOnOnePage({ cv, ...fit })).toBe(false);

    const trimmed = fitToOnePage(cv, fit);

    expect(trimmed).not.toBeNull();
    expect(trimmed?.profile.startsWith('Première phrase.')).toBe(true);
    expect(trimmed?.profile.length).toBeLessThan(cv.profile.length);
  });

  it('[RG-24] gives up, with null, when even the bare entry lines do not hold on a page', () => {
    const organization = 'Société de conseil en systèmes d’information '.repeat(4).trim();
    const cv: AdaptedCv = {
      ...longCv(0),
      experiences: Array.from({ length: 20 }, () => ({ title: 'Data Analyst', organization, place: 'Lyon', dates: '09/2020 – 08/2021', bullets: [] })),
    };

    expect(fitToOnePage(cv, fit)).toBeNull();
  });
});
