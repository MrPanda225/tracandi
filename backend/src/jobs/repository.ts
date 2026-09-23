import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { type jobName, jobRunCounters, jobRuns, type runCounter, type runOutcome, type triggerType } from '../db/schema.js';

export type JobName = (typeof jobName.enumValues)[number];
export type TriggerType = (typeof triggerType.enumValues)[number];
export type RunOutcome = (typeof runOutcome.enumValues)[number];
export type RunCounter = (typeof runCounter.enumValues)[number];

/**
 * Opens the journal line of one execution, at the outcome `running` (EF-GML-18).
 * @returns the id of the run.
 * @req EF-GML-18
 */
export const insertJobRun = async (
  db: Database,
  run: { userId: number; job: JobName; triggerType: TriggerType; startedAt: Date },
): Promise<number> => {
  const [row] = await db.insert(jobRuns).values(run).returning({ id: jobRuns.id });
  if (!row) throw new Error('job run insert returned no row');
  return row.id;
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
    outcome: Exclude<RunOutcome, 'running'>;
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
