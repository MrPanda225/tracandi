import { describe, expect, it } from 'vitest';
import { readPeriod, writePeriod } from './period';

describe('readPeriod', () => {
  it.each([
    ['Oct. 2024 – Avril 2026', { start: '2024-10', end: '2026-04', isCurrent: false }],
    ['octobre 2024 - avril 2026', { start: '2024-10', end: '2026-04', isCurrent: false }],
    ['10/2024 – 04/2026', { start: '2024-10', end: '2026-04', isCurrent: false }],
    // A year alone means the whole year: January at the start, December at the end.
    ['2024 – 2026', { start: '2024-01', end: '2026-12', isCurrent: false }],
    ['Sept. 2023', { start: '2023-09', end: '', isCurrent: false }],
  ])('[EF-CVX-02] reads « %s » back into two months', (dates, expected) => {
    expect(readPeriod(dates)).toMatchObject(expected);
  });

  it.each(['Oct. 2024 – aujourd’hui', 'octobre 2024 - présent', '10/2024 – en cours'])(
    '[EF-CVX-02] reads « %s » as a period still going',
    (dates) => {
      expect(readPeriod(dates)).toMatchObject({ start: '2024-10', end: '', isCurrent: true });
    },
  );

  it('[EF-CVX-02] [RG-12] keeps what it cannot read, rather than losing it', () => {
    expect(readPeriod('Depuis le printemps')).toMatchObject({
      start: '',
      end: '',
      original: 'Depuis le printemps',
    });
  });

  it('[EF-CVX-02] reads an empty period as empty, with nothing to keep', () => {
    expect(readPeriod('')).toEqual({ start: '', end: '', isCurrent: false, original: null });
  });
});

describe('writePeriod', () => {
  it('[RG-15] writes the months the CV expects', () => {
    const written = writePeriod({ start: '2024-10', end: '2026-04', isCurrent: false, original: null });

    expect(written).toBe('10/2024 – 04/2026');
  });

  it('[EF-CVX-02] writes a period still going with the word the CV shows', () => {
    expect(writePeriod({ start: '2024-10', end: '', isCurrent: true, original: null })).toBe(
      '10/2024 – aujourd’hui',
    );
  });

  it('[EF-CVX-02] writes the start alone while no end is chosen', () => {
    expect(writePeriod({ start: '2024-10', end: '', isCurrent: false, original: null })).toBe('10/2024');
  });

  it('[RG-12] gives back what it could not read, as long as no date is chosen', () => {
    const kept = { start: '', end: '', isCurrent: false, original: 'Depuis le printemps' };

    expect(writePeriod(kept)).toBe('Depuis le printemps');
    // Once a start is picked, the picked value replaces it.
    expect(writePeriod({ ...kept, start: '2024-10', original: null })).toBe('10/2024');
  });

  it('[EF-CVX-02] reads back what it wrote', () => {
    const period = { start: '2024-10', end: '2026-04', isCurrent: false, original: null };

    expect(readPeriod(writePeriod(period))).toEqual(period);
  });
});
