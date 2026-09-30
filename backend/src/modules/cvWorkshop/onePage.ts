import type { AdaptedCv } from './adaptedCv.js';
import type { CvContacts } from './contacts.js';

/** RG-22: the usual section titles, in the order recruiters and their software expect them. */
export const ATS_SECTION_TITLES = {
  profile: 'Profil',
  experiences: 'Expériences professionnelles',
  education: 'Formation',
  skills: 'Compétences',
  certifications: 'Certifications',
  languages: 'Langues',
  interests: 'Centres d’intérêt',
} as const;

/** One paragraph of the CV, in reading order: what the Word file writes and what the page measure counts. */
export interface CvBlock {
  kind: 'name' | 'headline' | 'contact' | 'heading' | 'entry' | 'text' | 'bullet';
  text: string;
}

/**
 * How tight the page is set: sizes in points, margins in centimetres. RG-24: never below 10 pt nor 1.5 cm.
 * The first one is the comfortable setting of RG-22; the next ones are tried only when the CV needs them.
 */
export interface PageDensity {
  bodyPt: number;
  namePt: number;
  headlinePt: number;
  headingPt: number;
  marginCm: number;
  headingBeforePt: number;
  headingAfterPt: number;
  entryBeforePt: number;
}

export const PAGE_DENSITIES: readonly PageDensity[] = [
  {
    bodyPt: 11,
    namePt: 16,
    headlinePt: 13,
    headingPt: 12,
    marginCm: 2,
    headingBeforePt: 12,
    headingAfterPt: 4,
    entryBeforePt: 6,
  },
  {
    bodyPt: 10.5,
    namePt: 15,
    headlinePt: 12,
    headingPt: 11.5,
    marginCm: 1.75,
    headingBeforePt: 9,
    headingAfterPt: 3,
    entryBeforePt: 4,
  },
  {
    bodyPt: 10,
    namePt: 14,
    headlinePt: 11.5,
    headingPt: 11,
    marginCm: 1.5,
    headingBeforePt: 7,
    headingAfterPt: 2,
    entryBeforePt: 3,
  },
];

const CONTACT_SEPARATOR = ' | ';
const LIST_SEPARATOR = ', ';
const TITLE_SEPARATOR = ' — ';
const DATES_SEPARATOR = ' | ';

/** The skills of the CV, then those the candidate ticked (EF-CVX-28), each once whatever its case. */
export const mergeSkills = (skills: readonly string[], added: readonly string[]): string[] => {
  const seen = new Set<string>();
  return [...skills, ...added].filter((skill) => {
    const key = skill.trim().toLocaleLowerCase('fr');
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** A titled section, or nothing when it has no content: no empty title in the CV (RG-22). */
const section = (title: string, children: readonly CvBlock[]): CvBlock[] =>
  children.length > 0 ? [{ kind: 'heading', text: title }, ...children] : [];

const listSection = (title: string, values: readonly string[]): CvBlock[] =>
  section(title, values.length > 0 ? [{ kind: 'text', text: values.join(LIST_SEPARATOR) }] : []);

/**
 * « Title — Organisation, place | dates »: one line a recruiting software reads as the entry's title and period, and
 * one line fewer per entry on the page (RG-24).
 */
const entry = ({
  what,
  organization,
  place,
  dates,
}: {
  what: string;
  organization: string;
  place: string | null;
  dates: string;
}): CvBlock => ({
  kind: 'entry',
  text: `${what}${TITLE_SEPARATOR}${organization}${place ? `${LIST_SEPARATOR}${place}` : ''}${DATES_SEPARATOR}${dates}`,
});

/**
 * The paragraphs of the adapted CV, in order: contact details at the top of the body, then the usual sections of
 * RG-22, empty ones left out, the ticked skills added to « Compétences » (EF-CVX-28).
 * @req RG-22, EF-CVX-28
 */
export const cvBlocks = ({
  cv,
  contacts,
  addedSkills,
}: {
  cv: AdaptedCv;
  contacts: CvContacts;
  addedSkills: readonly string[];
}): CvBlock[] => {
  const details = [
    ...contacts.emails,
    ...contacts.phones,
    ...(contacts.address ? [contacts.address] : []),
    ...contacts.links,
  ];
  return [
    ...(contacts.name ? [{ kind: 'name' as const, text: contacts.name }] : []),
    { kind: 'headline', text: cv.headline },
    ...(details.length > 0 ? [{ kind: 'contact' as const, text: details.join(CONTACT_SEPARATOR) }] : []),
    ...section(ATS_SECTION_TITLES.profile, cv.profile ? [{ kind: 'text', text: cv.profile }] : []),
    ...section(
      ATS_SECTION_TITLES.experiences,
      cv.experiences.flatMap((experience): CvBlock[] => [
        entry({ what: experience.title, ...experience }),
        ...experience.bullets.map((bullet): CvBlock => ({ kind: 'bullet', text: bullet })),
      ]),
    ),
    ...section(
      ATS_SECTION_TITLES.education,
      cv.education.flatMap((item): CvBlock[] => [
        entry({ what: item.degree, organization: item.school, place: item.place, dates: item.dates }),
        ...(item.detail ? [{ kind: 'text' as const, text: item.detail }] : []),
      ]),
    ),
    ...listSection(ATS_SECTION_TITLES.skills, mergeSkills(cv.skills, addedSkills)),
    ...listSection(ATS_SECTION_TITLES.certifications, cv.certifications),
    ...listSection(ATS_SECTION_TITLES.languages, cv.languages),
    ...listSection(ATS_SECTION_TITLES.interests, cv.interests),
  ];
};

// The measure is deliberately pessimistic, so that a CV it accepts holds on one page in Word and LibreOffice:
// characters counted wider than Calibri's (about 0.45 em on French text), lines taller than its 1.22 em.
const PT_PER_CM = 72 / 2.54;
const A4_WIDTH_PT = 595.3;
const A4_HEIGHT_PT = 841.9;
const REGULAR_EM = 0.5;
const BOLD_EM = 0.54;
const LINE_HEIGHT_EM = 1.25;
// Word's bullet: the text starts 0.5 inch from the margin.
const BULLET_INDENT_PT = 36;
const PAGE_SAFETY = 0.95;

/** Lines a paragraph takes once wrapped word by word, at a width of so many characters. */
const wrappedLines = (text: string, charsPerLine: number): number => {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/u).filter((part) => part !== '')) {
    const needed = used === 0 ? word.length : used + 1 + word.length;
    if (needed <= charsPerLine) {
      used = needed;
      continue;
    }
    lines += used === 0 ? 0 : 1;
    // A word longer than a line breaks across lines.
    lines += Math.floor(Math.max(0, word.length - 1) / charsPerLine);
    used = word.length % charsPerLine || charsPerLine;
  }
  return lines;
};

const styleOf = (kind: CvBlock['kind'], density: PageDensity) => {
  switch (kind) {
    case 'name':
      return { sizePt: density.namePt, bold: true, beforePt: 0, afterPt: 0, indentPt: 0 };
    case 'headline':
      return { sizePt: density.headlinePt, bold: false, beforePt: 0, afterPt: 0, indentPt: 0 };
    case 'heading':
      return {
        sizePt: density.headingPt,
        bold: true,
        beforePt: density.headingBeforePt,
        afterPt: density.headingAfterPt,
        indentPt: 0,
      };
    case 'entry':
      return { sizePt: density.bodyPt, bold: true, beforePt: density.entryBeforePt, afterPt: 0, indentPt: 0 };
    case 'bullet':
      return { sizePt: density.bodyPt, bold: false, beforePt: 0, afterPt: 0, indentPt: BULLET_INDENT_PT };
    default:
      return { sizePt: density.bodyPt, bold: false, beforePt: 0, afterPt: 0, indentPt: 0 };
  }
};

/** Height the blocks take on the page, in points, at this density. */
const heightOf = (blocks: readonly CvBlock[], density: PageDensity): number => {
  const widthPt = A4_WIDTH_PT - 2 * density.marginCm * PT_PER_CM;
  return blocks.reduce((total, block) => {
    const style = styleOf(block.kind, density);
    const charWidthPt = style.sizePt * (style.bold ? BOLD_EM : REGULAR_EM);
    const charsPerLine = Math.max(1, Math.floor((widthPt - style.indentPt) / charWidthPt));
    return (
      total +
      wrappedLines(block.text, charsPerLine) * style.sizePt * LINE_HEIGHT_EM +
      style.beforePt +
      style.afterPt
    );
  }, 0);
};

const fitsAt = (blocks: readonly CvBlock[], density: PageDensity): boolean =>
  heightOf(blocks, density) <= (A4_HEIGHT_PT - 2 * density.marginCm * PT_PER_CM) * PAGE_SAFETY;

/**
 * RG-24: the most comfortable density at which these blocks hold on one A4 page, or null when even the tightest one
 * (10 pt, 1.5 cm) is not enough.
 * @req RG-24
 */
export const densityFor = (blocks: readonly CvBlock[]): PageDensity | null =>
  PAGE_DENSITIES.find((density) => fitsAt(blocks, density)) ?? null;

/**
 * RG-24, EF-CVX-37: whether the adapted CV holds on one A4 page with its contact details and every skill the
 * candidate may still tick (all the missing ones of the diagnostic, EF-CVX-28).
 * @req RG-24, EF-CVX-37
 */
export const fitsOnOnePage = (input: {
  cv: AdaptedCv;
  contacts: CvContacts;
  addedSkills: readonly string[];
}): boolean => densityFor(cvBlocks(input)) !== null;
