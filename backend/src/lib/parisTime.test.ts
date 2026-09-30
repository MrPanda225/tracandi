import { describe, expect, it } from 'vitest';
import { parisDayBounds, startOfParisDay } from './parisTime.js';

describe('parisDayBounds', () => {
  it('[EF-CAN-24] bounds a Paris day of summer time, from midnight to the next midnight', () => {
    expect(parisDayBounds('2026-09-15')).toEqual({
      start: new Date('2026-09-14T22:00:00.000Z'),
      end: new Date('2026-09-15T22:00:00.000Z'),
    });
  });

  it('[EF-CAN-24] lasts 25 hours on the day the clocks go back', () => {
    const { start, end } = parisDayBounds('2026-10-25');

    expect(start).toEqual(new Date('2026-10-24T22:00:00.000Z'));
    expect(end).toEqual(new Date('2026-10-25T23:00:00.000Z'));
  });

  it('[EF-CAN-24] lasts 23 hours on the day the clocks go forward', () => {
    const { start, end } = parisDayBounds('2027-03-28');

    expect(start).toEqual(new Date('2027-03-27T23:00:00.000Z'));
    expect(end).toEqual(new Date('2027-03-28T22:00:00.000Z'));
  });
});

describe('startOfParisDay', () => {
  it('[EF-CVX-33] finds midnight in Paris on the day the clocks go back, not an hour later', () => {
    expect(startOfParisDay(new Date('2026-10-25T15:00:00.000Z'))).toEqual(new Date('2026-10-24T22:00:00.000Z'));
  });
});
