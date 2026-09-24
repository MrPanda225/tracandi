import { describe, expect, it } from 'vitest';
import { daysBetween, lastWeekStarts, responseRate, WEEKS_SHOWN, weekStartOf } from './rules.js';

describe('responseRate', () => {
  it('[RG-07] counts Entretien, Proposition and Refusée as answers', () => {
    expect(responseRate({ sent: 5, acknowledged: 2, interview: 1, offer: 1, rejected: 1 })).toBe(30);
  });

  it('[RG-07] rounds to the nearest integer', () => {
    expect(responseRate({ sent: 2, rejected: 1 })).toBe(33);
    expect(responseRate({ sent: 1, interview: 2 })).toBe(67);
  });

  it('[RG-07] is 0 when there is no application', () => {
    expect(responseRate({})).toBe(0);
    expect(responseRate({ sent: 0, rejected: 0 })).toBe(0);
  });
});

describe('weekStartOf', () => {
  it.each([
    ['2026-09-21T00:00:00.000Z', '2026-09-21T00:00:00.000Z'],
    ['2026-09-22T08:00:00.000Z', '2026-09-21T00:00:00.000Z'],
    ['2026-09-27T23:59:59.999Z', '2026-09-21T00:00:00.000Z'],
    ['2026-09-28T00:00:00.000Z', '2026-09-28T00:00:00.000Z'],
    ['2027-01-01T12:00:00.000Z', '2026-12-28T00:00:00.000Z'],
  ])('[EF-TDB-04] week of %s starts on Monday %s (UTC)', (instant, monday) => {
    expect(weekStartOf(new Date(instant)).toISOString()).toBe(monday);
  });
});

describe('lastWeekStarts', () => {
  it('[EF-TDB-04] lists the 5 weeks ending with the current one, oldest first', () => {
    const weeks = lastWeekStarts(new Date('2026-09-22T08:00:00.000Z'));

    expect(WEEKS_SHOWN).toBe(5);
    expect(weeks).toHaveLength(WEEKS_SHOWN);
    expect(weeks[0]?.toISOString()).toBe('2026-08-24T00:00:00.000Z');
    expect(weeks.at(-1)?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
});

describe('daysBetween', () => {
  it('counts whole elapsed days and never goes below 0', () => {
    const now = new Date('2026-09-22T08:00:00.000Z');
    expect(daysBetween(new Date('2026-09-11T09:00:00.000Z'), now)).toBe(10);
    expect(daysBetween(new Date('2026-09-23T08:00:00.000Z'), now)).toBe(0);
  });
});
