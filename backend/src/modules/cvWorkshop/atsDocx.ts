import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
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

// A widespread font, readable at 11 pt; sizes in half-points, lengths in twips (1 cm = 567 twips).
const FONT = 'Calibri';
const BODY_HALF_POINTS = 22;
const NAME_HALF_POINTS = 32;
const HEADLINE_HALF_POINTS = 26;
const HEADING_HALF_POINTS = 24;
const TWIPS_PER_CM = 567;
const MARGIN_TWIPS = 2 * TWIPS_PER_CM;
const A4_WIDTH_TWIPS = 11_906;
const A4_HEIGHT_TWIPS = 16_838;
const SPACE_BEFORE_HEADING = 240;
const SPACE_AFTER_HEADING = 80;
const SPACE_BEFORE_ENTRY = 120;
const CONTACT_SEPARATOR = ' | ';
const LIST_SEPARATOR = ', ';
const TITLE_SEPARATOR = ' — ';

const text = (content: string, options: { bold?: boolean; size?: number } = {}): Paragraph =>
  new Paragraph({ children: [new TextRun({ text: content, font: FONT, ...options })] });

const heading = (title: string): Paragraph =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: SPACE_BEFORE_HEADING, after: SPACE_AFTER_HEADING },
    children: [new TextRun({ text: title, font: FONT, bold: true, size: HEADING_HALF_POINTS })],
  });

const bullet = (content: string): Paragraph =>
  new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: content, font: FONT })] });

/** « Title — Organisation, place »: one line a recruiting software reads as the entry's title. */
const entryTitle = (title: string, organization: string, place: string | null): Paragraph =>
  new Paragraph({
    spacing: { before: SPACE_BEFORE_ENTRY },
    children: [
      new TextRun({
        text: `${title}${TITLE_SEPARATOR}${organization}${place ? `${LIST_SEPARATOR}${place}` : ''}`,
        font: FONT,
        bold: true,
      }),
    ],
  });

/** The contact details in the body, at the top: a Word header is skipped by some recruiting software (RG-22). */
const identity = (cv: AdaptedCv, contacts: CvContacts): Paragraph[] => {
  const details = [...contacts.emails, ...contacts.phones, ...(contacts.address ? [contacts.address] : []), ...contacts.links];
  return [
    ...(contacts.name ? [text(contacts.name, { bold: true, size: NAME_HALF_POINTS })] : []),
    text(cv.headline, { size: HEADLINE_HALF_POINTS }),
    ...(details.length > 0 ? [text(details.join(CONTACT_SEPARATOR))] : []),
  ];
};

/** The skills of the CV, then those the candidate ticked (EF-CVX-28), each once whatever its case. */
const mergeSkills = (skills: readonly string[], added: readonly string[]): string[] => {
  const seen = new Set<string>();
  return [...skills, ...added].filter((skill) => {
    const key = skill.trim().toLocaleLowerCase('fr');
    if (key === '' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** A titled section, or nothing when it has no content: no empty title in the CV (RG-22). */
const section = (title: string, children: readonly Paragraph[]): Paragraph[] =>
  children.length > 0 ? [heading(title), ...children] : [];

const listSection = (title: string, values: readonly string[]): Paragraph[] =>
  section(title, values.length > 0 ? [text(values.join(LIST_SEPARATOR))] : []);

/**
 * Writes the adapted CV as a Word file readable by recruiting software (RG-22): one column of real text; contact
 * details at the top of the body; the usual section titles as Word headings, in their order, empty sections left
 * out; no table, image, text box, header or footer. The skills the candidate ticked are added to « Compétences ».
 * @returns the bytes of the .docx, ready to download.
 * @req EF-CVX-28, EF-CVX-31, RG-22
 */
export const renderAtsDocx = async ({
  cv,
  contacts,
  addedSkills,
}: {
  cv: AdaptedCv;
  contacts: CvContacts;
  addedSkills: readonly string[];
}): Promise<Buffer> => {
  const children = [
    ...identity(cv, contacts),
    ...section(ATS_SECTION_TITLES.profile, cv.profile ? [text(cv.profile)] : []),
    ...section(
      ATS_SECTION_TITLES.experiences,
      cv.experiences.flatMap((experience) => [
        entryTitle(experience.title, experience.organization, experience.place),
        text(experience.dates),
        ...experience.bullets.map(bullet),
      ]),
    ),
    ...section(
      ATS_SECTION_TITLES.education,
      cv.education.flatMap((entry) => [
        entryTitle(entry.degree, entry.school, entry.place),
        text(entry.dates),
        ...(entry.detail ? [text(entry.detail)] : []),
      ]),
    ),
    ...listSection(ATS_SECTION_TITLES.skills, mergeSkills(cv.skills, addedSkills)),
    ...listSection(ATS_SECTION_TITLES.certifications, cv.certifications),
    ...listSection(ATS_SECTION_TITLES.languages, cv.languages),
    ...listSection(ATS_SECTION_TITLES.interests, cv.interests),
  ];
  const document = new Document({
    creator: 'Tracandi',
    title: contacts.name ? `CV — ${contacts.name}` : 'CV',
    styles: { default: { document: { run: { font: FONT, size: BODY_HALF_POINTS } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
            margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
};
