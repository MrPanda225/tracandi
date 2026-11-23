import { describe, expect, it } from 'vitest';
import { HttpError } from '../../lib/errors.js';
import {
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  decodeCsvFile,
  readCsvTable,
  readImportRow,
  suggestMapping,
} from './csvImport.js';
import type { ImportMapping } from './schemas.js';

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
const statusOf = (run: () => unknown): number | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof HttpError ? error.statusCode : -1;
  }
};

// 2026-09-30 10:00 in Paris.
const NOW = new Date('2026-09-30T08:00:00.000Z');
const MAPPING: ImportMapping = { company: 0, jobTitle: 1, link: 2, appliedAt: 3, status: 4, notes: 5 };
const row = (cells: Partial<Record<keyof ImportMapping, string>>) => [
  cells.company ?? 'Atelier Nova',
  cells.jobTitle ?? 'Data analyst',
  cells.link ?? '',
  cells.appliedAt ?? '',
  cells.status ?? '',
  cells.notes ?? '',
];

describe('decodeCsvFile', () => {
  it('[EF-CAN-23] returns the text of a UTF-8 file', () => {
    expect(decodeCsvFile(base64('Entreprise;Poste\nNova;Développeur'))).toBe(
      'Entreprise;Poste\nNova;Développeur',
    );
  });

  it('[EF-CAN-23] refuses a file larger than 1 MB with 413, before decoding it', () => {
    expect(statusOf(() => decodeCsvFile('A'.repeat(Math.ceil((CSV_MAX_BYTES + 3) / 3) * 4)))).toBe(413);
    expect(statusOf(() => decodeCsvFile(base64('a'.repeat(CSV_MAX_BYTES + 1))))).toBe(413);
  });

  it('[EF-CAN-23] refuses a file that is not text with 415 (binary or not UTF-8)', () => {
    expect(
      statusOf(() => decodeCsvFile(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]).toString('base64'))),
    ).toBe(415);
    expect(statusOf(() => decodeCsvFile(Buffer.from([0x4e, 0xe9, 0x6f]).toString('base64')))).toBe(415);
  });

  it('[EF-CAN-23] refuses a truncated base64 content with 400', () => {
    expect(statusOf(() => decodeCsvFile('abc'))).toBe(400);
  });
});

describe('readCsvTable', () => {
  it('[EF-CAN-23] separates the header from the rows and drops the empty rows', () => {
    expect(readCsvTable('Entreprise,Poste\nNova,Dev\n,\n  ,\nBeta,Ops\n')).toEqual({
      delimiter: ',',
      headers: ['Entreprise', 'Poste'],
      rows: [
        { line: 2, cells: ['Nova', 'Dev'] },
        { line: 5, cells: ['Beta', 'Ops'] },
      ],
    });
  });

  it('[EF-CAN-23] refuses more than 1 000 rows with 413', () => {
    const text = `Entreprise\n${Array.from({ length: CSV_MAX_ROWS + 1 }, (_, index) => `E${index}`).join('\n')}`;
    expect(statusOf(() => readCsvTable(text))).toBe(413);
    expect(
      readCsvTable(
        text
          .split('\n')
          .slice(0, CSV_MAX_ROWS + 1)
          .join('\n'),
      ).rows,
    ).toHaveLength(CSV_MAX_ROWS);
  });

  it('[EF-CAN-23] refuses an empty file and an invalid CSV with 400 naming the line', () => {
    expect(statusOf(() => readCsvTable(''))).toBe(400);
    expect(() => readCsvTable('a,b\n"ouvert')).toThrow(/ligne 2/iu);
  });
});

describe('suggestMapping', () => {
  it('[EF-CAN-23] proposes a column for each field from French or English column names', () => {
    expect(
      suggestMapping([
        'Date de candidature',
        'Société',
        'Poste',
        'Lien de l’offre',
        'Statut',
        'Commentaires',
      ]),
    ).toEqual({ company: 1, jobTitle: 2, link: 3, appliedAt: 0, status: 4, notes: 5 });
    expect(suggestMapping(['Company', 'Job title', 'URL', 'Applied on', 'Status', 'Notes'])).toEqual({
      company: 0,
      jobTitle: 1,
      link: 2,
      appliedAt: 3,
      status: 4,
      notes: 5,
    });
  });

  it('[EF-CAN-23] leaves a field without column when no name matches, and never gives one column twice', () => {
    expect(suggestMapping(['Entreprise', 'Entreprise (ancienne)', 'Divers'])).toEqual({
      company: 0,
      jobTitle: null,
      link: null,
      appliedAt: null,
      status: null,
      notes: null,
    });
  });
});

describe('readImportRow', () => {
  it('[EF-CAN-23] reads every mapped field of a row', () => {
    expect(
      readImportRow(
        row({
          company: ' Atelier Nova ',
          jobTitle: 'Data analyst H/F',
          link: 'https://emplois.example/offre/12',
          appliedAt: '15/09/2026',
          status: 'Entretien',
          notes: 'Appel le 20',
        }),
        { mapping: MAPPING, now: NOW },
      ),
    ).toEqual({
      ok: true,
      value: {
        companyName: 'Atelier Nova',
        jobTitle: 'Data analyst H/F',
        status: 'interview',
        appliedAt: new Date('2026-09-14T22:00:00.000Z'),
        notes: 'Lien : https://emplois.example/offre/12\n\nAppel le 20',
      },
    });
  });

  it.each([
    ['2026-09-15', '2026-09-14T22:00:00.000Z'],
    ['15/09/26', '2026-09-14T22:00:00.000Z'],
    ['5/1/2026', '2026-01-04T23:00:00.000Z'],
  ])('[EF-CAN-23] [EF-CAN-16] reads the date « %s » as the Paris day starting at %s', (cell, instant) => {
    const read = readImportRow(row({ appliedAt: cell }), { mapping: MAPPING, now: NOW });
    expect(read.ok && read.value.appliedAt.toISOString()).toBe(instant);
  });

  it.each([
    ['À postuler', 'to_apply'],
    ['envoyée', 'sent'],
    ['Accusé de réception', 'acknowledged'],
    ['Rejected', 'rejected'],
    ['offer', 'offer'],
    ['REFUSÉE', 'rejected'],
  ])('[EF-CAN-23] reads the status « %s » as %s', (cell, status) => {
    const read = readImportRow(row({ status: cell }), { mapping: MAPPING, now: NOW });
    expect(read.ok && read.value.status).toBe(status);
  });

  it('[EF-CAN-23] defaults an empty or unmapped cell: « Candidature », Envoyée, today, no notes', () => {
    const mapping: ImportMapping = {
      company: 0,
      jobTitle: null,
      link: null,
      appliedAt: null,
      status: null,
      notes: null,
    };
    expect(readImportRow(['Nova'], { mapping, now: NOW })).toEqual({
      ok: true,
      value: { companyName: 'Nova', jobTitle: 'Candidature', status: 'sent', appliedAt: NOW, notes: null },
    });
  });

  const expectRefused = (cells: Partial<Record<keyof ImportMapping, string>>, reason: RegExp): void => {
    const read = readImportRow(row(cells), { mapping: MAPPING, now: NOW });
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toMatch(reason);
  };

  it.each([
    [{ company: '' }, /entreprise/iu],
    [{ company: '***' }, /entreprise/iu],
    [{ company: 'N'.repeat(161) }, /160/u],
    [{ jobTitle: 'T'.repeat(301) }, /300/u],
    [{ status: 'En cours' }, /statut/iu],
    [{ notes: 'n'.repeat(2001) }, /2 000/u],
  ])('[EF-CAN-23] refuses the row %j with a reason', expectRefused);

  it.each([
    [{ appliedAt: '31/02/2026' }, /date/iu],
    [{ appliedAt: 'septembre' }, /JJ\/MM\/AAAA/u],
    [{ appliedAt: '01/10/2026' }, /futur/iu],
    [{ appliedAt: '31/12/1999' }, /2000/u],
  ])('[EF-CAN-23] [EF-CAN-16] refuses the row %j with a reason', expectRefused);

  it.each([
    [{ link: 'javascript:alert(1)' }, /lien/iu],
    [{ link: `https://example.org/${'a'.repeat(1000)}` }, /lien/iu],
  ])('[EF-CAN-23] [EF-CAN-19] refuses the row %j with a reason', expectRefused);
});
