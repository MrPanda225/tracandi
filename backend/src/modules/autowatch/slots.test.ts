import { describe, expect, it } from 'vitest';
import { slotAt, WATCH_SLOTS } from './slots.js';

const PARIS = 'Europe/Paris';

describe('slotAt', () => {
  it.each([
    // Summer time (UTC+2): 7 h, 13 h and 19 h in Paris.
    ['2026-09-22T05:00:00.000Z', 'morning'],
    ['2026-09-22T11:00:00.000Z', 'noon'],
    ['2026-09-22T17:00:00.000Z', 'evening'],
    // Winter time (UTC+1): the same three o'clock, one hour later in UTC.
    ['2026-12-10T06:00:00.000Z', 'morning'],
    ['2026-12-10T12:00:00.000Z', 'noon'],
    ['2026-12-10T18:00:00.000Z', 'evening'],
  ])('[EF-VEI-51] puts %s in the %s slot, whatever the season', (instant, slot) => {
    expect(slotAt(new Date(instant), PARIS)).toBe(slot);
  });

  it('[EF-VEI-51] puts a pass that starts a little late in the slot of the hour it was due', () => {
    // 7:20 and 13:05 and 19:40: a busy queue starts a pass minutes after the cron fired.
    expect(slotAt(new Date('2026-09-22T05:20:00.000Z'), PARIS)).toBe('morning');
    expect(slotAt(new Date('2026-09-22T11:05:00.000Z'), PARIS)).toBe('noon');
    expect(slotAt(new Date('2026-09-22T17:40:00.000Z'), PARIS)).toBe('evening');
  });

  it('[EF-VEI-51] cuts the day at 10 h and at 16 h, Paris time', () => {
    expect(slotAt(new Date('2026-09-22T07:59:00.000Z'), PARIS)).toBe('morning'); // 9:59
    expect(slotAt(new Date('2026-09-22T08:00:00.000Z'), PARIS)).toBe('noon'); // 10:00
    expect(slotAt(new Date('2026-09-22T13:59:00.000Z'), PARIS)).toBe('noon'); // 15:59
    expect(slotAt(new Date('2026-09-22T14:00:00.000Z'), PARIS)).toBe('evening'); // 16:00
  });

  it('[EF-VEI-51] reads the hour in the time zone asked, not in UTC', () => {
    // 8 h UTC is 10 h in Paris in summer: noon there, still the morning for a server set to UTC.
    const instant = new Date('2026-09-22T08:00:00.000Z');
    expect(slotAt(instant, PARIS)).toBe('noon');
    expect(slotAt(instant, 'UTC')).toBe('morning');
  });

  it('[EF-CFG-07] names the three slots of the day in order', () => {
    expect(WATCH_SLOTS).toEqual(['morning', 'noon', 'evening']);
  });
});
