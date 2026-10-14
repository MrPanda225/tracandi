import { describe, expect, it } from 'vitest';
import { FICTITIOUS_CV_LINES } from '../../../tests/fixtures/cv/pdf.js';
import { separateContacts } from './contacts.js';

const CV = FICTITIOUS_CV_LINES.join('\n');

describe('separateContacts', () => {
  it('[ENF-RGP-07] takes out the name, e-mail, phone, postal address and profile link', () => {
    const { text } = separateContacts(CV);

    for (const detail of [
      'Camille Durand',
      'camille.durand@example.com',
      '06 12 34 56 78',
      '69003',
      'linkedin.com',
    ]) {
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

    for (const fact of [
      'Data Analyst - Atelier Nova',
      '12 equipes commerciales',
      'Master Informatique',
      'SQL, Python',
    ]) {
      expect(text).toContain(fact);
    }
  });

  it('[ENF-RGP-07] also takes out the name where it appears again, and international numbers and web links', () => {
    const { text, contacts } = separateContacts(
      [
        'Camille Durand',
        'Portfolio : https://camille.example.org',
        '+33 6 12 34 56 78',
        'Référence : Camille Durand',
      ].join('\n'),
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

/** The longest an adversarial text may take, however it is written: far above a real CV, far below a frozen server. */
const TIME_BUDGET_MS = 500;
const timeOf = (work: () => unknown): number => {
  const startedAt = performance.now();
  work();
  return performance.now() - startedAt;
};

describe('separateContacts, an adversarial text (review of the lot 10)', () => {
  it('[ENF-SEC-22] reads a line of 60 separators followed by a word without freezing the server', () => {
    const line = `Expérience ${'- '.repeat(60)}Paris`;

    expect(timeOf(() => separateContacts(line))).toBeLessThan(TIME_BUDGET_MS);
  });

  it('[ENF-SEC-22] reads a very long run of letters, then an « @ » nowhere, without freezing the server', () => {
    expect(timeOf(() => separateContacts('a'.repeat(200_000)))).toBeLessThan(TIME_BUDGET_MS);
  });

  it('[ENF-SEC-22] reads a very long run of spaces and pipes without freezing the server', () => {
    expect(timeOf(() => separateContacts(`${' '.repeat(100_000)}x`))).toBeLessThan(TIME_BUDGET_MS);
    expect(timeOf(() => separateContacts(`x${' |'.repeat(50_000)} y`))).toBeLessThan(TIME_BUDGET_MS);
  });

  it('[ENF-SEC-22] still finds an address in the middle of a long text', () => {
    const { contacts } = separateContacts(
      `${'mot '.repeat(5000)}écrire à camille.durand@example.com ${'mot '.repeat(5000)}`,
    );

    expect(contacts.emails).toEqual(['camille.durand@example.com']);
  });

  it('[ENF-RGP-07] still tidies the separators a detail leaves behind, as it did', () => {
    const { text } = separateContacts('Data Analyst | camille@example.com | | Lyon ,\n; : SQL, Python -');

    expect(text).toBe('Data Analyst | Lyon\nSQL, Python');
  });
});

describe('separateContacts, contacts cut out of their line (EF-CVX-45)', () => {
  it('[EF-CVX-45] removes only the address from a line it shares with a bullet of the main column', () => {
    const { text, contacts } = separateContacts(
      'Lucie Marchand\n3 rue des Pins, 44000 Nantes • Supervision Prometheus de 40 services.\nAutre ligne',
    );

    expect(contacts.address).toBe('3 rue des Pins, 44000 Nantes');
    expect(text).toBe('Supervision Prometheus de 40 services.\nAutre ligne');
  });

  it('[EF-CVX-45] removes only the e-mail and the phone from a line shared with other words', () => {
    const { text } = separateContacts('Lucie Marchand\nSQL lucie@example.com Python 06 12 34 56 78 Docker');

    expect(text).toBe('SQL  Python  Docker');
  });

  it('[EF-CVX-45] does not take « 20000 factures » in a sentence for the address', () => {
    const { text, contacts } = separateContacts(
      'Traitement de 20000 factures par mois.\nGestion de 12500 Clients',
    );

    expect(contacts.address).toBeNull();
    expect(text).toContain('Traitement de 20000 factures par mois.');
    expect(text).toContain('Gestion de 12500 Clients');
  });

  it('[EF-CVX-45] still reads a postal code and town on a line of their own, or after a label', () => {
    expect(separateContacts('69003 Lyon').contacts.address).toBe('69003 Lyon');
    expect(separateContacts('Adresse : 12 Rue des Lilas, 69003 Lyon').contacts.address).toBe(
      '12 Rue des Lilas, 69003 Lyon',
    );
  });

  it('[EF-CVX-45] does not take dates written « 09 2022 06 2023 » for a phone number', () => {
    const { text, contacts } = separateContacts('Ingénieure 09 2022 06 2023 Nordwave\n06 12 34 56 78');

    expect(contacts.phones).toEqual(['06 12 34 56 78']);
    expect(text).toContain('09 2022 06 2023');
  });

  it('[EF-CVX-45] reads numbers written without separators, with dots or with dashes', () => {
    expect(separateContacts('0612345678').contacts.phones).toEqual(['0612345678']);
    expect(separateContacts('06.12.34.56.78').contacts.phones).toEqual(['06.12.34.56.78']);
    expect(separateContacts('06-12-34-56-78').contacts.phones).toEqual(['06-12-34-56-78']);
  });
});
