const PARIS = 'Europe/Paris';
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const MS_PER_DAY = 24 * MINUTES_PER_HOUR * MS_PER_MINUTE;

const parisDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const parisOffset = new Intl.DateTimeFormat('en-GB', { timeZone: PARIS, timeZoneName: 'longOffset' });

/** The offset of Paris from UTC at that instant, in minutes: 60 in winter, 120 in summer. */
const offsetMinutesAt = (instant: Date): number => {
  const name =
    parisOffset.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * MINUTES_PER_HOUR + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

/**
 * Midnight of a Paris calendar day « YYYY-MM-DD », as an instant. The offset is read at midnight itself, not at
 * another hour of the day: on the days the clocks change, the two differ.
 */
const parisMidnight = (day: string): Date => {
  const utcMidnight = Date.parse(`${day}T00:00:00.000Z`);
  // Twice: the offset at the first guess may still be the one of the previous hour.
  let instant = utcMidnight - offsetMinutesAt(new Date(utcMidnight)) * MS_PER_MINUTE;
  instant = utcMidnight - offsetMinutesAt(new Date(instant)) * MS_PER_MINUTE;
  return new Date(instant);
};

/** The day after « YYYY-MM-DD », as « YYYY-MM-DD ». */
const nextDay = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + MS_PER_DAY).toISOString().slice(0, 10);

/**
 * Midnight of the current day in Paris, as an instant, summer and winter time included.
 * @req EF-CVX-33
 */
export const startOfParisDay = (now: Date): Date => parisMidnight(parisDate.format(now));

/**
 * EF-CAN-24: the instants that bound a Paris calendar day « YYYY-MM-DD », from its midnight included to the next
 * midnight excluded — 23 or 25 hours apart on the days the clocks change.
 * @req EF-CAN-24
 */
export const parisDayBounds = (day: string): { start: Date; end: Date } => ({
  start: parisMidnight(day),
  end: parisMidnight(nextDay(day)),
});
