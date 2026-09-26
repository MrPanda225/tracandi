import { describe, expect, it } from 'vitest';
import { FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { separateContacts } from './contacts.js';

const CV = FICTITIOUS_CV_LINES.join('\n');

describe('separateContacts', () => {
  it('[ENF-RGP-07] takes out the name, e-mail, phone, postal address and profile link', () => {
    const { text } = separateContacts(CV);

    for (const detail of ['Camille Durand', 'camille.durand@example.com', '06 12 34 56 78', '69003', 'linkedin.com']) {
      expect(text).not.toContain(detail);
    }
  });

  it('[ENF-RGP-07] keeps them aside, to put them back in the downloaded CV', () => {
    expect(separateContacts(CV).contacts).toEqual({
      name: 'Camille Durand',
      emails: ['camille.durand@example.com'],
      phones: ['06 12 34 56 78'],
      address: '12 rue des Lilas, 69003 Lyon',
      links: ['linkedin.com/in/camille-durand-exemple'],
    });
  });

  it('[ENF-RGP-07] leaves the professional content untouched', () => {
    const { text } = separateContacts(CV);

    for (const fact of ['Data Analyst - Atelier Nova', '12 equipes commerciales', 'Master Informatique', 'SQL, Python']) {
      expect(text).toContain(fact);
    }
  });

  it('[ENF-RGP-07] also takes out the name where it appears again, and international numbers and web links', () => {
    const { text, contacts } = separateContacts(
      ['Camille Durand', 'Portfolio : https://camille.example.org', '+33 6 12 34 56 78', 'Référence : Camille Durand'].join(
        '\n',
      ),
    );

    expect(text).not.toMatch(/Camille|https:|\+33/);
    expect(contacts.phones).toEqual(['+33 6 12 34 56 78']);
    expect(contacts.links).toEqual(['https://camille.example.org']);
  });

  it('[ENF-RGP-07] takes no name when the first line is a title rather than a name', () => {
    const { contacts, text } = separateContacts('Curriculum Vitae\nData Analyst');

    expect(contacts.name).toBeNull();
    expect(text).toContain('Data Analyst');
  });
});
