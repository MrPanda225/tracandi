import { describe, expect, it } from 'vitest';
import { datePeriodsIn, parseDatePeriod, samePeriod } from './datePeriods.js';

describe('parseDatePeriod', () => {
  it.each([
    ['Sept. 2021 – Présent', { start: { y: 2021, m: 9 }, end: 'open' }],
    ['09/2021 - aujourd’hui', { start: { y: 2021, m: 9 }, end: 'open' }],
    ['Janv. 2019 - Févr. 2020', { start: { y: 2019, m: 1 }, end: { y: 2020, m: 2 } }],
    ['Jan 2020 to now', { start: { y: 2020, m: 1 }, end: 'open' }],
    ['2021–2023', { start: { y: 2021 }, end: { y: 2023 } }],
    ['août 2022', { start: { y: 2022, m: 8 }, end: null }],
  ])('[EF-CVX-46] reads %s', (text, period) => {
    expect(parseDatePeriod(text)).toEqual(period);
  });

  it('[EF-CVX-46] does not take a word before a year for a month', () => {
    expect(parseDatePeriod('Développeur 2021')).toEqual({ start: { y: 2021 }, end: null });
  });

  it('[EF-CVX-46] finds no period in a text without a date', () => {
    expect(parseDatePeriod('Data analyst')).toBeNull();
    expect(datePeriodsIn('Paris, France')).toEqual([]);
  });

  it('[EF-CVX-46] tells equal periods from different ones', () => {
    const a = parseDatePeriod('Sept. 2021 – Présent');
    expect(a && samePeriod(a, parseDatePeriod('09/2021 - actuel') ?? a)).toBe(true);
    expect(a && samePeriod(a, parseDatePeriod('09/2021 - 06/2023') ?? a)).toBe(false);
    expect(a && samePeriod(a, parseDatePeriod('2021 - Présent') ?? a)).toBe(false);
  });
});
