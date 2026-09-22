/** EF-CAN-16: no application date before this day (same bound as the API). */
export const EARLIEST_DATE_INPUT = '2000-01-01';

// A past day is sent at local noon: no time zone offset can move it to the previous or next day in UTC.
const NOON = 12;

const twoDigits = (value: number) => String(value).padStart(2, '0');

/** `YYYY-MM-DD` of an instant in the user's local time, as a date input expects it. */
export const toDateInputValue = (instant: Date | string): string => {
  const date = new Date(instant);
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
};

/**
 * Instant to send for a day picked in a date input: now for today (keeps the real hour), local noon for a past day.
 * `value` is a valid `YYYY-MM-DD`.
 */
export const appliedAtFromInput = (value: string, now: Date): string => {
  if (value === toDateInputValue(now)) return now.toISOString();
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  return new Date(year, month - 1, day, NOON).toISOString();
};

/** Reason to refuse a picked application date (EF-CAN-16), or null when it is acceptable. */
export const appliedDateProblem = (value: string, now: Date): string | null => {
  if (!value) return 'Indiquez la date de candidature.';
  if (value > toDateInputValue(now)) return 'La date de candidature ne peut pas être dans le futur.';
  if (value < EARLIEST_DATE_INPUT) return 'La date de candidature doit être postérieure au 1er janvier 2000.';
  return null;
};
