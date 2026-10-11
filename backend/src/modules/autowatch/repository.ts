import { and, arrayContains, asc, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { appSettings, jobRunCounters, jobRuns } from '../../db/schema.js';
import type { WatchSlot } from './slots.js';

/** What the candidate chose for their watch; the defaults of the table until they chose (EF-CFG-07). */
export interface AutomaticWatchSettings {
  enabled: boolean;
  slots: WatchSlot[];
}

const DEFAULTS: AutomaticWatchSettings = { enabled: false, slots: ['morning', 'noon', 'evening'] };

/** @req EF-CFG-07 */
export const findSettings = async (db: Database, userId: number): Promise<AutomaticWatchSettings> => {
  const [row] = await db
    .select({ enabled: appSettings.watchAutoEnabled, slots: appSettings.watchSlots })
    .from(appSettings)
    .where(eq(appSettings.userId, userId));
  return row ?? DEFAULTS;
};

/**
 * Replaces the choice of the candidate. The settings row is made at registration; it is written here anyway, so
 * that a candidate without one is not refused.
 * @req EF-CFG-07
 */
export const saveSettings = async (
  db: Database,
  { userId, enabled, slots }: AutomaticWatchSettings & { userId: number },
): Promise<void> => {
  await db
    .insert(appSettings)
    .values({ userId, watchAutoEnabled: enabled, watchSlots: slots })
    .onConflictDoUpdate({
      target: appSettings.userId,
      set: { watchAutoEnabled: enabled, watchSlots: slots },
    });
};

/**
 * Candidates whose watch runs by itself at this slot: those who activated it and ticked the slot (EF-VEI-51).
 * @req EF-VEI-06, EF-VEI-51, EF-CFG-07
 */
export const listUsersAtSlot = async (db: Database, slot: WatchSlot): Promise<number[]> => {
  const rows = await db
    .select({ userId: appSettings.userId })
    .from(appSettings)
    .where(and(eq(appSettings.watchAutoEnabled, true), arrayContains(appSettings.watchSlots, [slot])))
    .orderBy(asc(appSettings.userId));
  return rows.map((row) => row.userId);
};

/** One scheduled pass with the counters it recorded. */
export interface RecordedPass {
  slot: WatchSlot;
  outcome: (typeof jobRuns.$inferSelect)['outcome'];
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  counters: Record<string, number>;
}

/**
 * The scheduled passes of the watch of this user started since `since`, in the order they were started. Served by
 * the index `ix_job_runs_user_job_started` (user, job, start).
 * @req EF-CFG-08
 */
export const listPassesSince = async (
  db: Database,
  { userId, since }: { userId: number; since: Date },
): Promise<RecordedPass[]> => {
  const runs = await db
    .select({
      id: jobRuns.id,
      slot: jobRuns.slot,
      outcome: jobRuns.outcome,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      error: jobRuns.error,
    })
    .from(jobRuns)
    .where(and(eq(jobRuns.userId, userId), eq(jobRuns.job, 'scraper'), gte(jobRuns.startedAt, since)))
    .orderBy(asc(jobRuns.id));
  const passes = runs.flatMap((run) => (run.slot === null ? [] : [{ ...run, slot: run.slot }]));
  if (passes.length === 0) return [];
  const counters = await db
    .select({ runId: jobRunCounters.runId, counter: jobRunCounters.counter, value: jobRunCounters.value })
    .from(jobRunCounters)
    .where(
      inArray(
        jobRunCounters.runId,
        passes.map((pass) => pass.id),
      ),
    );
  return passes.map(({ id, ...pass }) => ({
    ...pass,
    counters: Object.fromEntries(
      counters.filter((row) => row.runId === id).map((row) => [row.counter, row.value]),
    ),
  }));
};

/**
 * When the last scheduled pass of this user that succeeded ended, whichever day it was. A pass that was ignored or
 * failed, and the pass the candidate asked for (it has no slot), are not one. Served by the index
 * `ix_job_runs_user_job_started` (user, job, start).
 * @req EF-CFG-08
 */
export const findLastSuccessAt = async (db: Database, userId: number): Promise<Date | null> => {
  const [row] = await db
    .select({ finishedAt: jobRuns.finishedAt })
    .from(jobRuns)
    .where(
      and(
        eq(jobRuns.userId, userId),
        eq(jobRuns.job, 'scraper'),
        eq(jobRuns.outcome, 'success'),
        isNotNull(jobRuns.slot),
        isNotNull(jobRuns.finishedAt),
      ),
    )
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  return row?.finishedAt ?? null;
};
