import { and, desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { type jobName, jobRunCounters, jobRuns, type runCounter, type runOutcome, type triggerType } from '../db/schema.js';

export type JobName = (typeof jobName.enumValues)[number];
export type TriggerType = (typeof triggerType.enumValues)[number];
export type RunOutcome = (typeof runOutcome.enumValues)[number];
export type RunCounter = (typeof runCounter.enumValues)[number];

/** States an execution goes through before it is over (EF-EXE-02, EF-EXE-03). */
export const PENDING_OUTCOMES = ['queued', 'running'] as const;

/**
 * Opens the journal line of one execution (EF-GML-18). `queued` when it waits its turn, `running` when the queue
 * starts it at once.
 * @returns the id of the run.
 * @req EF-GML-18, EF-EXE-01
 */
export const insertJobRun = async (
  db: Database,
  run: { userId: number; job: JobName; triggerType: TriggerType; startedAt: Date; outcome: RunOutcome },
): Promise<number> => {
  const [row] = await db.insert(jobRuns).values(run).returning({ id: jobRuns.id });
  if (!row) throw new Error('job run insert returned no row');
  return row.id;
};

/** Marks a queued execution as started (EF-EXE-02). */
export const startJobRun = async (db: Database, runId: number, startedAt: Date): Promise<void> => {
  await db.update(jobRuns).set({ outcome: 'running', startedAt }).where(eq(jobRuns.id, runId));
};

/** One execution as the interface shows it (EF-EXE-03), with the counters it recorded. */
export interface JobRunView {
  id: number;
  userId: number;
  job: JobName;
  trigger: TriggerType;
  outcome: RunOutcome;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;
  counters: Partial<Record<RunCounter, number>>;
}

/** The execution of this id, whoever owns it; the caller checks the owner (EF-AUT-06). */
export const findJobRun = async (db: Database, runId: number): Promise<JobRunView | null> => {
  const [run] = await db
    .select({
      id: jobRuns.id,
      userId: jobRuns.userId,
      job: jobRuns.job,
      trigger: jobRuns.triggerType,
      outcome: jobRuns.outcome,
      startedAt: jobRuns.startedAt,
      finishedAt: jobRuns.finishedAt,
      error: jobRuns.error,
    })
    .from(jobRuns)
    .where(eq(jobRuns.id, runId));
  if (!run) return null;
  const counters = await db
    .select({ counter: jobRunCounters.counter, value: jobRunCounters.value })
    .from(jobRunCounters)
    .where(eq(jobRunCounters.runId, runId));
  return { ...run, counters: Object.fromEntries(counters.map((row) => [row.counter, row.value])) };
};

/** True when this user already has an execution of this job waiting or running (EF-GML-18). */
export const hasPendingRun = async (db: Database, userId: number, job: JobName): Promise<boolean> => {
  const [row] = await db
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(
      and(eq(jobRuns.userId, userId), eq(jobRuns.job, job), inArray(jobRuns.outcome, [...PENDING_OUTCOMES])),
    )
    .orderBy(desc(jobRuns.id))
    .limit(1);
  return row !== undefined;
};

/**
 * EF-EXE-05: closes in failure every execution left waiting or running by a stopped server; nothing is ever left
 * hanging in the journal.
 * @returns how many were closed.
 */
export const failInterruptedRuns = async (db: Database, finishedAt: Date, error: string): Promise<number> => {
  const closed = await db
    .update(jobRuns)
    .set({ outcome: 'failure', finishedAt, error })
    .where(inArray(jobRuns.outcome, [...PENDING_OUTCOMES]))
    .returning({ id: jobRuns.id });
  return closed.length;
};

/**
 * Closes the journal line of one execution with its end, outcome, error and counters, in one transaction.
 * @req EF-GML-18
 */
export const finishJobRun = async (
  db: Database,
  runId: number,
  end: {
    finishedAt: Date;
    outcome: Exclude<RunOutcome, 'running' | 'queued'>;
    error: string | null;
    counters: Partial<Record<RunCounter, number>>;
  },
): Promise<void> => {
  const counters = Object.entries(end.counters).map(([counter, value]) => ({
    runId,
    counter: counter as RunCounter,
    value,
  }));
  await db.transaction(async (tx) => {
    await tx
      .update(jobRuns)
      .set({ finishedAt: end.finishedAt, outcome: end.outcome, error: end.error })
      .where(eq(jobRuns.id, runId));
    if (counters.length > 0) await tx.insert(jobRunCounters).values(counters);
  });
};
