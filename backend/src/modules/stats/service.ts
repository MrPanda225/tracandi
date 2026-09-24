import type { Database } from '../../db/client.js';
import { applicationStatus, contractType } from '../../db/schema.js';
import type { Clock } from '../../lib/clock.js';
import type { ApplicationStatus } from '../applications/rules.js';
import * as repository from './repository.js';
import type { ApplicationGroupRow, WeeklyRow } from './repository.js';
import { daysBetween, lastWeekStarts, responseRate } from './rules.js';
import type { DashboardView } from './schemas.js';

// RG-06 and EF-TDB-08 defaults, used if the settings row is missing (same as the column defaults).
const DEFAULT_FOLLOW_UP_DAYS = 10;
const DEFAULT_OFFER_ALERT_THRESHOLD = 60;
const FOLLOW_UPS_SHOWN = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Dashboard figures, always scoped to one user (EF-AUT-06). */
export interface StatsService {
  dashboard(userId: number): Promise<DashboardView>;
}

type StatusCounts = Partial<Record<ApplicationStatus, number>>;

const sumBy = <T>(rows: readonly T[], keyOf: (row: T) => string, countOf: (row: T) => number) =>
  rows.reduce<Record<string, number>>((sums, row) => {
    const key = keyOf(row);
    return { ...sums, [key]: (sums[key] ?? 0) + countOf(row) };
  }, {});

const statusCountsOf = (rows: readonly ApplicationGroupRow[]): StatusCounts =>
  sumBy(
    rows,
    (row) => row.status,
    (row) => row.count,
  );

/** EF-TDB-01, 03, 05, 06, 09 derived from the (status, contract type, channel) counts. */
const summarize = (groups: readonly ApplicationGroupRow[]) => {
  const byStatus = statusCountsOf(groups);
  const direct = groups.filter((row) => row.isDirect).reduce((sum, row) => sum + row.count, 0);
  const total = groups.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    responseRate: responseRate(byStatus),
    byStatus: applicationStatus.enumValues.map((status) => ({ status, count: byStatus[status] ?? 0 })),
    byChannel: { direct, platform: total - direct },
    byContractType: contractType.enumValues.map((type) => {
      const ofType = groups.filter((row) => row.contractType === type);
      return {
        contractType: type,
        count: ofType.reduce((sum, row) => sum + row.count, 0),
        responseRate: responseRate(statusCountsOf(ofType)),
      };
    }),
  };
};

const countOfWeek = (rows: readonly WeeklyRow[], weekStart: Date): number =>
  rows.find((row) => row.weekStart.getTime() === weekStart.getTime())?.count ?? 0;

/** EF-TDB-04: one entry per week, weeks without activity included with zeros. */
const weeklySeries = (
  weeks: readonly Date[],
  {
    sent,
    changes,
  }: { sent: readonly WeeklyRow[]; changes: readonly (WeeklyRow & { status: ApplicationStatus })[] },
): DashboardView['weekly'] => {
  const interviews = changes.filter((row) => row.status === 'interview');
  const rejected = changes.filter((row) => row.status === 'rejected');
  return weeks.map((weekStart) => ({
    weekStart,
    sent: countOfWeek(sent, weekStart),
    interviews: countOfWeek(interviews, weekStart),
    rejected: countOfWeek(rejected, weekStart),
  }));
};

/**
 * Creates the statistics service. Every figure is computed from the user's own data (EF-AUT-06); the rates follow
 * RG-07, follow-ups RG-06 with the user's delay D, and the weekly series covers the last 5 weeks in UTC (EF-TDB-04 v1.21).
 * Without the offers watch (`countsOffers` false), the offers are neither read nor shown: `offers` is null.
 * @req EF-TDB-01 to EF-TDB-09, RG-06, RG-07, ENF-MAI-07
 */
export const createStatsService = ({
  db,
  clock,
  countsOffers,
}: {
  db: Database;
  clock: Clock;
  countsOffers: boolean;
}): StatsService => ({
  async dashboard(userId) {
    const now = clock();
    const weeks = lastWeekStarts(now);
    const since = weeks[0] ?? now;
    const settings = await repository.getDashboardSettings(db, userId);
    const followUpDays = settings?.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS;
    const threshold = settings?.offerAlertThreshold ?? DEFAULT_OFFER_ALERT_THRESHOLD;
    const inactiveSince = new Date(now.getTime() - followUpDays * DAY_MS);

    const [groups, reachedInterview, sent, changes, followUps, newOffers] = await Promise.all([
      repository.countApplicationGroups(db, userId),
      repository.countReachedInterview(db, userId),
      repository.countSentPerWeek(db, userId, since),
      repository.countStatusChangesPerWeek(db, userId, since),
      repository.listFollowUps(db, userId, { inactiveSince, limit: FOLLOW_UPS_SHOWN }),
      countsOffers ? repository.countNewOffersAbove(db, userId, threshold) : null,
    ]);
    const summary = summarize(groups);

    return {
      totals: { applications: summary.total, reachedInterview, responseRate: summary.responseRate },
      byStatus: summary.byStatus,
      byChannel: summary.byChannel,
      byContractType: summary.byContractType,
      weekly: weeklySeries(weeks, { sent, changes }),
      followUps: {
        total: followUps.total,
        items: followUps.rows.map((row) => ({
          ...row,
          daysSinceActivity: daysBetween(row.lastActivityAt, now),
        })),
      },
      offers: newOffers === null ? null : { newAboveThreshold: newOffers, threshold },
      followUpDays,
    };
  },
});
