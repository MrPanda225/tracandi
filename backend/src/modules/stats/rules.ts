import type { ApplicationStatus } from '../applications/rules.js';

/** EF-TDB-04: number of weeks shown by the weekly chart, current week included. */
// EF-TDB-04 (v1.21): the current week and the four before it.
export const WEEKS_SHOWN = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const PERCENT = 100;
// RG-07: statuses counted as an answer from the employer.
const ANSWERED_STATUSES: ReadonlySet<ApplicationStatus> = new Set(['interview', 'offer', 'rejected']);

/**
 * RG-07: (Entretien + Proposition + Refusée) / total × 100, rounded to the nearest integer; 0 when the total is 0.
 * @req RG-07, EF-TDB-03, EF-TDB-09
 */
export const responseRate = (countsByStatus: Partial<Record<ApplicationStatus, number>>): number => {
  const entries = Object.entries(countsByStatus) as [ApplicationStatus, number][];
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 0;
  const answered = entries.reduce(
    (sum, [status, count]) => sum + (ANSWERED_STATUSES.has(status) ? count : 0),
    0,
  );
  return Math.round((answered / total) * PERCENT);
};

/**
 * Monday 00:00 UTC of the week containing `instant` (ISO week, ADR-07 dates in UTC).
 * @req EF-TDB-04
 */
export const weekStartOf = (instant: Date): Date => {
  const midnight = Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate());
  const daysSinceMonday = (instant.getUTCDay() + 6) % 7;
  return new Date(midnight - daysSinceMonday * DAY_MS);
};

/**
 * Start of each of the `WEEKS_SHOWN` weeks ending with the current one, oldest first.
 * @req EF-TDB-04
 */
export const lastWeekStarts = (now: Date): Date[] => {
  const current = weekStartOf(now).getTime();
  return Array.from(
    { length: WEEKS_SHOWN },
    (_, index) => new Date(current - (WEEKS_SHOWN - 1 - index) * WEEK_MS),
  );
};

/** Whole days elapsed between `since` and `now` (0 when `since` is in the future). */
export const daysBetween = (since: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
