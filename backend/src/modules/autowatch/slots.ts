import { watchSlot } from '../../db/schema.js';

/** EF-CFG-07: the three moments of the day when the watch runs for a candidate who chose them. */
export const WATCH_SLOTS = watchSlot.enumValues;
export type WatchSlot = (typeof WATCH_SLOTS)[number];

/** The pass of 7 h is the morning's, the pass of 13 h the noon's, the pass of 19 h the evening's (EF-VEI-51). */
const NOON_FROM_HOUR = 10;
const EVENING_FROM_HOUR = 16;
const HOURS_OF_THE_DAY = 24;

const hourFormats = new Map<string, Intl.DateTimeFormat>();
const formatIn = (timezone: string): Intl.DateTimeFormat => {
  const known = hourFormats.get(timezone);
  if (known) return known;
  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: 'numeric',
  });
  hourFormats.set(timezone, format);
  return format;
};

/** The hour of an instant on the wall clock of a time zone, from 0 to 23. */
const hourIn = (instant: Date, timezone: string): number => {
  const hour = formatIn(timezone)
    .formatToParts(instant)
    .find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 0) % HOURS_OF_THE_DAY;
};

/**
 * The slot an instant belongs to, by the hour on the wall clock of the time zone: before 10 h the morning, until
 * 16 h the noon, then the evening. A pass that starts minutes after its hour (a busy queue) keeps its own slot.
 * @req EF-VEI-51
 */
export const slotAt = (instant: Date, timezone: string): WatchSlot => {
  const hour = hourIn(instant, timezone);
  if (hour < NOON_FROM_HOUR) return 'morning';
  return hour < EVENING_FROM_HOUR ? 'noon' : 'evening';
};
