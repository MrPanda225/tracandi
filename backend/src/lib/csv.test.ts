import { describe, expect, it } from 'vitest';
import { CsvSyntaxError, parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('[EF-CAN-23] reads comma-separated records and their header', () => {
    expect(parseCsv('Entreprise,Poste\nAtelier Nova,Data analyst\n')).toEqual({
      delimiter: ',',
      records: [
        ['Entreprise', 'Poste'],
        ['Atelier Nova', 'Data analyst'],
      ],
    });
  });

  it('[EF-CAN-23] detects the semicolon separator of a French spreadsheet', () => {
    const parsed = parseCsv('Entreprise;Poste;Notes\r\nAtelier Nova;Data analyst;Relance, puis appel\r\n');
    expect(parsed.delimiter).toBe(';');
    expect(parsed.records[1]).toEqual(['Atelier Nova', 'Data analyst', 'Relance, puis appel']);
  });

  it('[EF-CAN-23] keeps separators, line breaks and doubled quotes inside a quoted field (RFC 4180)', () => {
    const text = 'Entreprise,Notes\n"Nova, Lyon","Premier appel\nle ""lundi"""\nBeta,ok';
    expect(parseCsv(text).records).toEqual([
      ['Entreprise', 'Notes'],
      ['Nova, Lyon', 'Premier appel\nle "lundi"'],
      ['Beta', 'ok'],
    ]);
  });

  it('[EF-CAN-23] ignores the UTF-8 byte order mark', () => {
    expect(parseCsv('﻿Entreprise,Poste\nNova,Dev').records[0]).toEqual(['Entreprise', 'Poste']);
  });

  it('[EF-CAN-23] keeps empty fields, including trailing ones', () => {
    expect(parseCsv('a,b,c\n1,,\n').records[1]).toEqual(['1', '', '']);
  });

  it('[EF-CAN-23] reads a lone carriage return as a line break', () => {
    expect(parseCsv('a,b\r1,2\r').records).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('[EF-CAN-23] ignores a separator in a quoted header when detecting the delimiter', () => {
    expect(parseCsv('"Entreprise, nom";Poste\nNova;Dev').delimiter).toBe(';');
  });

  it('[EF-CAN-23] returns no record for an empty text', () => {
    expect(parseCsv('').records).toEqual([]);
  });

  it('[EF-CAN-23] refuses an unclosed quote and names the line where it starts', () => {
    expect(() => parseCsv('a,b\n1,"ouvert\nsuite')).toThrow(CsvSyntaxError);
    expect(() => parseCsv('a,b\n1,"ouvert\nsuite')).toThrow(/ligne 2/iu);
  });

  it('[EF-CAN-23] refuses a character between a closing quote and the next separator', () => {
    expect(() => parseCsv('a,b\n"x"y,2')).toThrow(CsvSyntaxError);
  });
});
