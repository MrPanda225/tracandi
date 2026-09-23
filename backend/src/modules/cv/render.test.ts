import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { readDocumentXml, readParagraphs, readZip } from '../../../tests/fixtures/docx/readDocx.js';
import { formatDates, renderCvDocx, SECTION_TITLES } from './render.js';
import { CandidateProfileSchema, type CvContent } from './schemas.js';

// The anonymised profile of the fixtures: the real one is never read (CLAUDE.md).
const PROFILE = CandidateProfileSchema.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../../tests/fixtures/profile.example.json', import.meta.url)),
      'utf8',
    ),
  ),
);

const CONTENT: CvContent = {
  identity: PROFILE.identity,
  availability: PROFILE.availability,
  title: 'Data Analyst en alternance',
  subtitle: PROFILE.cvSource.defaultSubtitle,
  profile: PROFILE.cvSource.profile,
  experiences: PROFILE.cvSource.experiences,
  education: PROFILE.cvSource.education,
  studyLevel: { level: 'bac_5', isInProgress: true },
  skills: PROFILE.cvSource.skills,
  certifications: [
    { name: 'Tableau Desktop Specialist', issuer: 'Tableau', year: 2025 },
    { name: 'TOEIC', issuer: null, year: null },
  ],
  interests: PROFILE.cvSource.interests,
};

let docx: Buffer;
let xml: string;
let paragraphs: string[];

beforeAll(async () => {
  docx = await renderCvDocx(CONTENT);
  xml = readDocumentXml(docx);
  paragraphs = readParagraphs(docx);
});

describe('renderCvDocx — a file Word opens (EF-CVX-06)', () => {
  it('[EF-CVX-06] produces a .docx, its parts where Word expects them', () => {
    const files = readZip(docx);

    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK');
    expect([...files.keys()]).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
    expect(files.get('[Content_Types].xml')).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
  });
});

describe('renderCvDocx — read by a recruiting software (EF-CVX-14, RG-15)', () => {
  it('[EF-CVX-14] [RG-15] holds no table, no text box, no header nor footer content', () => {
    expect(xml).not.toContain('<w:tbl>');
    expect(xml).not.toContain('w:txbxContent');
    expect(xml).not.toContain('<w:cols w:num=');
    const files = readZip(docx);
    const headersAndFooters = [...files.keys()].filter((name) => /word\/(header|footer)\d*\.xml/.test(name));
    for (const part of headersAndFooters) expect(files.get(part)).not.toMatch(/<w:t[ >]/);
  });

  it('[RG-15] names its sections as a recruiter expects, in the order of the CV', () => {
    const positions = Object.values(SECTION_TITLES).map((title) => paragraphs.indexOf(title));

    expect(positions.every((at) => at >= 0)).toBe(true);
    expect([...positions]).toEqual([...positions].sort((a, b) => a - b));
  });

  it('[EF-CVX-14] carries every experience, in the order of the CV, with its bullets', () => {
    const text = paragraphs.join('\n');

    for (const experience of CONTENT.experiences) {
      expect(text).toContain(experience.company);
      expect(text).toContain(experience.role);
      for (const line of experience.bullets) expect(text).toContain(line);
    }
    expect(text.indexOf('Boulangerie Exemple')).toBeLessThan(text.indexOf('Restaurant Test'));
  });

  it('[RG-15] carries the coordinates in the body of the document', () => {
    const header = paragraphs.slice(0, 5).join('\n');

    expect(header).toContain(CONTENT.identity.name);
    expect(header).toContain(CONTENT.identity.email);
    expect(header).toContain(CONTENT.identity.phone);
  });

  it('[RG-15] titles the CV with the job the offer names', () => {
    expect(paragraphs).toContain('Data Analyst en alternance');
  });
});

describe('formatDates — RG-15', () => {
  it.each([
    ['Oct. 2024 – Avril 2026', '10/2024 – 04/2026'],
    ['Juil. 2023 – Sept. 2023', '07/2023 – 09/2023'],
    ['Août 2022 – Oct. 2022', '08/2022 – 10/2022'],
    ['septembre 2025', '09/2025'],
  ])('[RG-15] writes « %s » as « %s »', (written, expected) => {
    expect(formatDates(written)).toBe(expected);
  });

  it.each([
    ['a range of years alone', '2024 – 2026'],
    ['a single year', '2020'],
    ['a wording the list does not hold', "Depuis aujourd'hui"],
  ])('[RG-12] leaves %s exactly as the profile wrote it', (_case, written) => {
    expect(formatDates(written)).toBe(written);
  });

  it('[RG-15] writes the dates of the CV with their month in figures', () => {
    expect(paragraphs.some((line) => line.startsWith('10/2024'))).toBe(true);
  });
  it('[RG-15] leaves untouched a period already written the way the screen records it', () => {
    // The Atelier CV screen writes « MM/AAAA – MM/AAAA » and « MM/AAAA – aujourd’hui » (period.ts).
    expect(formatDates('10/2024 – 04/2026')).toBe('10/2024 – 04/2026');
    expect(formatDates('10/2024 – aujourd’hui')).toBe('10/2024 – aujourd’hui');
  });
});

describe('renderCvDocx — the charter (EF-CVX-08, RG-11)', () => {
  it('[RG-11] sets the page to A4 with the usable width of the charter', () => {
    expect(xml).toContain('w:w="11906"');
    expect(xml).toContain('w:h="16838"');
    // 11 906 − 2 × 643 = 10 620 twips of usable width.
    expect(xml).toContain('w:left="643"');
    expect(xml).toContain('w:right="643"');
  });

  it('[RG-11] writes everything in Calibri 10 pt', () => {
    expect(xml).toContain('w:ascii="Calibri"');
    expect(xml).toContain('<w:sz w:val="20"/>');
  });

  it('[RG-11] centres the title in bold 15 pt and the subtitle in italic 11 pt', () => {
    expect(xml).toMatch(/<w:jc w:val="center"\/>/);
    expect(xml).toContain('<w:sz w:val="30"/>');
    expect(xml).toContain('<w:sz w:val="22"/>');
    expect(xml).toMatch(/<w:i\b/);
  });

  it('[RG-11] draws the section banners with their fill and their border', () => {
    expect(xml).toContain('w:fill="D9E2F3"');
    expect(xml).toContain('w:color="AAB5CE"');
  });

  it('[RG-11] aligns the content of the dated lines on the tab of the charter', () => {
    expect(xml).toContain('w:pos="2150"');
  });
});

describe('renderCvDocx — level of study and certifications (EF-CVX-20, RG-18)', () => {
  it('[EF-CVX-20] [RG-18] writes the level of study under the degrees, and says when it is under way', () => {
    const line = paragraphs.find((paragraph) => paragraph.startsWith('Niveau d’études'));

    expect(line).toBe('Niveau d’études : Bac+5 (master, diplôme d’ingénieur) (en cours)');
    // Under FORMATION, which it sums up, and before COMPÉTENCES.
    expect(paragraphs.indexOf(line ?? '')).toBeGreaterThan(paragraphs.indexOf(SECTION_TITLES.education));
    expect(paragraphs.indexOf(line ?? '')).toBeLessThan(paragraphs.indexOf(SECTION_TITLES.skills));
  });

  it('[EF-CVX-20] writes nothing about the level when the profile states none', async () => {
    const rendered = await renderCvDocx({ ...CONTENT, studyLevel: { level: null, isInProgress: false } });

    expect(readDocumentXml(rendered)).not.toContain('Niveau d’études');
  });

  it('[EF-CVX-20] gives the certifications a section, with their issuer and their year', async () => {
    expect(paragraphs).toContain(SECTION_TITLES.certifications);
    expect(paragraphs).toContain('2025\tTableau Desktop Specialist — Tableau');
    // A certification stated by its name alone carries neither a year nor a dash.
    expect(paragraphs).toContain('\tTOEIC');
  });

  it('[EF-CVX-20] [RG-12] opens no section when the candidate holds no certification', async () => {
    const rendered = await renderCvDocx({ ...CONTENT, certifications: [] });

    expect(readParagraphs(rendered)).not.toContain(SECTION_TITLES.certifications);
    expect(readDocumentXml(rendered)).not.toContain('TOEIC');
  });
});

describe('renderCvDocx — what it refuses to invent (RG-12, Q-01)', () => {
  it('[Q-01] inserts no photo: the space is left for one added by hand', () => {
    expect(xml).not.toContain('<w:drawing>');
    expect([...readZip(docx).keys()].filter((name) => name.startsWith('word/media/'))).toEqual([]);
  });

  it('[RG-12] shows nothing the content does not carry', async () => {
    const withoutInterests = await renderCvDocx({ ...CONTENT, interests: [] });

    expect(readParagraphs(withoutInterests)).not.toContain(SECTION_TITLES.interests);
    expect(readDocumentXml(withoutInterests)).not.toContain('Basketball');
  });
});
