import { describe, expect, it } from 'vitest';
import { readParagraphs, readZip } from '../../../tests/fixtures/docx/readDocx.js';
import type { AdaptedCv } from './adaptedCv.js';
import { ATS_SECTION_TITLES, renderAtsDocx } from './atsDocx.js';
import type { CvContacts } from './contacts.js';

const CONTACTS: CvContacts = {
  name: 'Camille Durand',
  emails: ['camille.durand@example.com'],
  phones: ['06 12 34 56 78'],
  address: '12 rue des Lilas, 69003 Lyon',
  links: ['linkedin.com/in/camille-durand-exemple'],
};

const CV: AdaptedCv = {
  headline: 'Data Analyst',
  profile: 'Data analyst habituée aux tableaux de bord commerciaux, en quête d’un CDI à Lyon.',
  experiences: [
    {
      title: 'Data Analyst',
      organization: 'Atelier Nova',
      place: 'Lyon',
      dates: '09/2024 – 08/2026',
      bullets: ['Tableaux de bord Power BI pour 12 équipes commerciales.', 'Requêtes SQL de suivi des ventes.'],
    },
  ],
  education: [
    { degree: 'Master Informatique', school: 'Université de Lyon', place: null, dates: '2024', detail: null },
  ],
  skills: ['SQL', 'Python', 'Power BI'],
  certifications: [],
  languages: ['Anglais : courant'],
  interests: [],
};

const render = (options: Partial<Parameters<typeof renderAtsDocx>[0]> = {}) =>
  renderAtsDocx({ cv: CV, contacts: CONTACTS, addedSkills: [], ...options });

describe('renderAtsDocx', () => {
  it('[EF-CVX-31] produces a Word document', async () => {
    const docx = await render();

    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(readZip(docx).has('word/document.xml')).toBe(true);
  });

  it('[RG-22] holds real text only: no table, image, text box, nor Word header or footer', async () => {
    const files = readZip(await render());
    const document = files.get('word/document.xml') ?? '';

    for (const forbidden of ['<w:tbl>', '<w:tbl ', '<w:drawing', '<w:pict', '<w:txbxContent', 'headerReference', 'footerReference']) {
      expect(document, forbidden).not.toContain(forbidden);
    }
    expect([...files.keys()].filter((name) => /word\/(header|footer)\d*\.xml/.test(name))).toEqual([]);
  });

  it('[RG-22] keeps a single column', async () => {
    const document = readZip(await render()).get('word/document.xml') ?? '';

    expect(document).not.toMatch(/<w:cols [^>]*w:num="[2-9]"/);
  });

  it('[RG-22] puts the contact details at the top of the body', async () => {
    const [name, headline, contact] = readParagraphs(await render());

    expect(name).toBe('Camille Durand');
    expect(headline).toBe('Data Analyst');
    expect(contact).toBe(
      'camille.durand@example.com | 06 12 34 56 78 | 12 rue des Lilas, 69003 Lyon | linkedin.com/in/camille-durand-exemple',
    );
  });

  it('[RG-22] names the sections as recruiters expect, in order, leaving the empty ones out', async () => {
    const paragraphs = readParagraphs(await render());

    const titles = paragraphs.filter((paragraph) => (Object.values(ATS_SECTION_TITLES) as string[]).includes(paragraph));
    expect(titles).toEqual(['Profil', 'Expériences professionnelles', 'Formation', 'Compétences', 'Langues']);
  });

  it('[RG-22] marks the section titles as Word headings, which a recruiting software reads as such', async () => {
    const document = readZip(await render()).get('word/document.xml') ?? '';

    expect(document.match(/<w:pStyle w:val="Heading2"\/>/g)).toHaveLength(5);
  });

  it('[EF-CVX-31] writes each experience with its title, company, place, dates and achievements', async () => {
    const paragraphs = readParagraphs(await render());

    expect(paragraphs).toEqual(
      expect.arrayContaining([
        'Data Analyst — Atelier Nova, Lyon',
        '09/2024 – 08/2026',
        'Tableaux de bord Power BI pour 12 équipes commerciales.',
        'Master Informatique — Université de Lyon',
      ]),
    );
  });

  it('[EF-CVX-28] adds the skills the candidate ticked, once, whatever their case', async () => {
    const paragraphs = readParagraphs(await render({ addedSkills: ['dbt', 'power bi', 'Airflow'] }));

    expect(paragraphs).toContain('SQL, Python, Power BI, dbt, Airflow');
  });

  it('[RG-22] writes no name line when none was found in the imported CV', async () => {
    const [first] = readParagraphs(await render({ contacts: { ...CONTACTS, name: null } }));

    expect(first).toBe('Data Analyst');
  });
});
