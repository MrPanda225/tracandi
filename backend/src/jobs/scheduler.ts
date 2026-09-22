import { schedule as cronSchedule } from 'node-cron';
import type { Logger } from '../lib/logger.js';

/** A recurring job: its name (as in `job_runs.job`), its cron expression and what it does. */
export interface ScheduledJob {
  name: string;
  cron: string;
  run: () => Promise<void>;
}

/** The part of node-cron used here, injected so that tests never wait for the clock. */
export type Schedule = (
  expression: string,
  task: () => Promise<void>,
  options: { timezone: string; name: string; noOverlap: boolean },
) => { stop: () => void | Promise<void> };

export interface Scheduler {
  stop: () => Promise<void>;
}

/**
 * Starts the recurring jobs in the configured time zone. A job never overlaps itself (a run still going when the next
 * one is due is skipped), and a failing run is logged without ever stopping the scheduler nor the process.
 * @req EF-GML-03, ENF-FIA-01
 */
export const startScheduler = ({
  jobs,
  timezone,
  logger,
  schedule = (expression, task, options) => cronSchedule(expression, task, options),
}: {
  jobs: readonly ScheduledJob[];
  timezone: string;
  logger: Logger;
  schedule?: Schedule;
}): Scheduler => {
  const tasks = jobs.map((job) =>
    schedule(
      job.cron,
      async () => {
        try {
          await job.run();
        } catch (error) {
          // ENF-FIA-01: the failure is the run's, never the scheduler's (a rejection would stop the process).
          logger.error('scheduled job failed', { job: job.name, error });
        }
      },
      { timezone, name: job.name, noOverlap: true },
    ),
  );
  return {
    async stop() {
      for (const task of tasks) await task.stop();
    },
  };
};
