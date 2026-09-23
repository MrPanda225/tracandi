import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import { STUDY_LEVEL_LABELS, type CvContent } from './schemas.js';

/** RG-11: Calibri 10 pt everywhere; docx counts sizes in half-points. */
const FONT = 'Calibri';
const BODY_HALF_POINTS = 20;
const TITLE_HALF_POINTS = 30;
const SUBTITLE_HALF_POINTS = 22;
/** RG-11: usable width and the tab the « dates | contenu » lines align on. */
const USABLE_WIDTH_TWIPS = 10_620;
const CONTENT_TAB_TWIPS = 2150;
/** A4 minus the usable width, shared between the two margins. */
const A4_WIDTH_TWIPS = 11_906;
const A4_HEIGHT_TWIPS = 16_838;
const SIDE_MARGIN_TWIPS = (A4_WIDTH_TWIPS - USABLE_WIDTH_TWIPS) / 2;
const VERTICAL_MARGIN_TWIPS = 567;
/** RG-11: section banners. */
const BANNER_FILL = 'D9E2F3';
const BANNER_BORDER = 'AAB5CE';
const BANNER_BORDER_SIZE = 4;
const SPACE_BEFORE_SECTION = 160;
const SPACE_AFTER_SECTION = 80;
const BULLET_INDENT_TWIPS = CONTENT_TAB_TWIPS;
const BULLET = '– ';

/** RG-15: the usual French section titles, in the order a recruiter expects them. */
export const SECTION_TITLES = {
  profile: 'PROFIL',
  experiences: 'EXPÉRIENCES PROFESSIONNELLES',
  education: 'FORMATION',
  skills: 'COMPÉTENCES',
  certifications: 'CERTIFICATIONS',
  interests: "CENTRES D'INTÉRÊT",
} as const;

const MONTHS: Readonly<Record<string, string>> = {
  janvier: '01',
  janv: '01',
  jan: '01',
  fevrier: '02',
  fevr: '02',
  fev: '02',
  mars: '03',
  avril: '04',
  avr: '04',
  mai: '05',
  juin: '06',
  juillet: '07',
  juil: '07',
  aout: '08',
  septembre: '09',
  sept: '09',
  octobre: '10',
  oct: '10',
  novembre: '11',
  nov: '11',
  decembre: '12',
  dec: '12',
};

const MONTH_AND_YEAR = /([a-zéèêûôîç]+)\.?\s+(\d{4})/gi;
const withoutAccents = (word: string): string => word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * RG-15: dates written « MM/AAAA ». A month the profile writes in words becomes its number; anything else — a year
 * alone, « aujourd'hui », a wording the list does not hold — is left exactly as the profile wrote it (RG-12).
 * @req EF-CVX-14, RG-15, RG-12
 */
export const formatDates = (dates: string): string =>
  dates.replace(MONTH_AND_YEAR, (whole, month: string, year: string) => {
    const number = MONTHS[withoutAccents(month)];
    return number ? `${number}/${year}` : whole;
  });

const bodyRun = (text: string, extra: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: BODY_HALF_POINTS, ...extra });

/** RG-11: a banner with its fill, its border and its label in capitals — a paragraph, never a table (RG-15). */
const section = (title: string): Paragraph =>
  new Paragraph({
    children: [bodyRun(title, { bold: true })],
    shading: { type: ShadingType.CLEAR, fill: BANNER_FILL, color: 'auto' },
    border: {
      top: { style: BorderStyle.SINGLE, size: BANNER_BORDER_SIZE, color: BANNER_BORDER },
      bottom: { style: BorderStyle.SINGLE, size: BANNER_BORDER_SIZE, color: BANNER_BORDER },
      left: { style: BorderStyle.SINGLE, size: BANNER_BORDER_SIZE, color: BANNER_BORDER },
      right: { style: BorderStyle.SINGLE, size: BANNER_BORDER_SIZE, color: BANNER_BORDER },
    },
    spacing: { before: SPACE_BEFORE_SECTION, after: SPACE_AFTER_SECTION },
  });

/** RG-11: a « dates | contenu » line, the content starting at the same tab everywhere in the CV. */
const datedLine = (dates: string, content: TextRun[]): Paragraph =>
  new Paragraph({
    tabStops: [{ type: TabStopType.LEFT, position: CONTENT_TAB_TWIPS }],
    children: [bodyRun(formatDates(dates)), new TextRun({ text: '\t' }), ...content],
  });

const bullet = (text: string): Paragraph =>
  new Paragraph({
    indent: { left: BULLET_INDENT_TWIPS, hanging: 0 },
    children: [bodyRun(`${BULLET}${text}`)],
  });

/**
 * RG-11: the header holds the coordinates on the left and the availability on the right, in two columns obtained
 * with a right tab (RG-15 forbids a table). Q-01: no photo is inserted, the space is left for one added by hand.
 */
const header = ({ identity, availability }: CvContent): Paragraph[] => {
  const left = [identity.name, identity.city, identity.phone, identity.email, identity.extra].filter(
    (line): line is string => line !== null && line !== '',
  );
  const right = availability.split(';').map((part) => part.trim());
  const lines = Math.max(left.length, right.length);
  return Array.from(
    { length: lines },
    (_, index) =>
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
        children: [
          bodyRun(left[index] ?? '', { bold: index === 0 }),
          new TextRun({ text: '\t' }),
          bodyRun(right[index] ?? ''),
        ],
      }),
  );
};

const experienceOf = (experience: CvContent['experiences'][number]): Paragraph[] => [
  datedLine(experience.dates, [
    bodyRun(experience.role, { bold: true }),
    bodyRun(` — ${experience.company}`),
    bodyRun(
      [experience.place, experience.duration].filter(Boolean).join(', ')
        ? ` (${[experience.place, experience.duration].filter(Boolean).join(', ')})`
        : '',
    ),
  ]),
  ...experience.bullets.map(bullet),
];

const educationOf = (degree: CvContent['education'][number]): Paragraph =>
  datedLine(degree.dates, [
    bodyRun(degree.degree ?? degree.school, { bold: true }),
    bodyRun(
      [degree.degree ? degree.school : null, degree.place, degree.detail].filter(Boolean).join(' — ')
        ? ` — ${[degree.degree ? degree.school : null, degree.place, degree.detail].filter(Boolean).join(' — ')}`
        : '',
    ),
  ]);

/**
 * RG-18: the level of study, written under the degrees it sums up. A profile that states none says nothing here
 * rather than « non précisé », which would waste a line of the single page (RG-11).
 * @req EF-CVX-20
 */
const studyLevelLine = (studyLevel: CvContent['studyLevel']): Paragraph[] => {
  if (studyLevel.level === null) return [];
  const suffix = studyLevel.isInProgress ? ' (en cours)' : '';
  return [
    new Paragraph({
      children: [
        bodyRun('Niveau d’études : ', { bold: true }),
        bodyRun(`${STUDY_LEVEL_LABELS[studyLevel.level]}${suffix}`),
      ],
    }),
  ];
};

/** EF-CVX-20: one line per certification, « intitulé — organisme » dated by its year when there is one. */
const certificationOf = (certification: CvContent['certifications'][number]): Paragraph =>
  datedLine(certification.year === null ? '' : String(certification.year), [
    bodyRun(certification.name, { bold: true }),
    bodyRun(certification.issuer === null ? '' : ` — ${certification.issuer}`),
  ]);

/**
 * Renders one CV as a Word document following the charter RG-11 and readable by a recruiting software (RG-15):
 * real text only, no table, no text box, nothing in a Word header or footer, sections named as recruiters expect.
 * @returns the bytes of the .docx, ready to be written or downloaded.
 * @req EF-CVX-06, EF-CVX-08, EF-CVX-14, RG-11, RG-15, Q-01
 */
export const renderCvDocx = async (content: CvContent): Promise<Buffer> => {
  const document = new Document({
    creator: 'Tracandi',
    title: content.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_HALF_POINTS } },
        heading1: { run: { font: FONT, size: TITLE_HALF_POINTS, bold: true } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
            margin: {
              top: VERTICAL_MARGIN_TWIPS,
              bottom: VERTICAL_MARGIN_TWIPS,
              left: SIDE_MARGIN_TWIPS,
              right: SIDE_MARGIN_TWIPS,
            },
          },
        },
        children: [
          ...header(content),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: SPACE_BEFORE_SECTION },
            children: [bodyRun(content.title, { bold: true, size: TITLE_HALF_POINTS })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [bodyRun(content.subtitle, { italics: true, size: SUBTITLE_HALF_POINTS })],
          }),
          section(SECTION_TITLES.profile),
          new Paragraph({ children: [bodyRun(content.profile)] }),
          section(SECTION_TITLES.experiences),
          ...content.experiences.flatMap(experienceOf),
          section(SECTION_TITLES.education),
          ...content.education.map(educationOf),
          ...studyLevelLine(content.studyLevel),
          section(SECTION_TITLES.skills),
          ...content.skills.map((skill) => datedLine(skill.label, [bodyRun(skill.value)])),
          ...(content.certifications.length > 0
            ? [section(SECTION_TITLES.certifications), ...content.certifications.map(certificationOf)]
            : []),
          ...(content.interests.length > 0
            ? [section(SECTION_TITLES.interests), ...content.interests.map(bullet)]
            : []),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
};
