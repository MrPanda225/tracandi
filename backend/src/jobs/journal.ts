import type { Database } from '../db/client.js';
import type { Clock } from '../lib/clock.js';
import * as repository from './repository.js';
import type { JobName, RunCounter, TriggerType } from './repository.js';

/** Who ran which job, and why (schedule or user). */
export interface RunEntry {
  userId: number;
  job: JobName;
  trigger: TriggerType;
}

export type RunCounters = Partial<Record<RunCounter, number>>;

// Same bound as job_runs.error.
const ERROR_MAX_LENGTH = 1000;

/** The message of a failure, bounded; never a stack nor an object dump (ENF-SEC-08). */
const describeFailure = (error: unknown): string =>
  (error instanceof Error ? error.message : 'Unknown failure').slice(0, ERROR_MAX_LENGTH);

export interface JobJournal {
  /**
   * Runs `work` and journals it in `job_runs`: a line at the start, then its end, outcome, counters and error.
   * @returns what `work` returns. @throws what `work` throws, once journaled as a failure.
   */
  record: <T>(entry: RunEntry, work: () => Promise<T>, countersOf: (result: T) => RunCounters) => Promise<T>;
  /** Journals an execution that did not run because another one of the same job was running. */
  recordSkipped: (entry: RunEntry) => Promise<void>;
}

/**
 * Journal of the executions of the scheduled and manual jobs (EF-GML-18).
 * @req EF-GML-18, ENF-FIA-01
 */
export const createJobJournal = ({ db, clock }: { db: Database; clock: Clock }): JobJournal => {
  const start = (entry: RunEntry) =>
    repository.insertJobRun(db, { userId: entry.userId, job: entry.job, triggerType: entry.trigger, startedAt: clock() });

  return {
    async record(entry, work, countersOf) {
      const runId = await start(entry);
      try {
        const result = await work();
        await repository.finishJobRun(db, runId, {
          finishedAt: clock(),
          outcome: 'success',
          error: null,
          counters: countersOf(result),
        });
        return result;
      } catch (error) {
        await repository.finishJobRun(db, runId, {
          finishedAt: clock(),
          outcome: 'failure',
          error: describeFailure(error),
          counters: {},
        });
        throw error;
      }
    },

    async recordSkipped(entry) {
      const runId = await start(entry);
      await repository.finishJobRun(db, runId, { finishedAt: clock(), outcome: 'skipped', error: null, counters: {} });
    },
  };
};
