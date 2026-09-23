import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../lib/logger.js';
import { type Schedule, startScheduler } from './scheduler.js';

const captureSchedule = () => {
  const tasks: { expression: string; task: () => Promise<void>; options: unknown }[] = [];
  const stops: string[] = [];
  const schedule: Schedule = (expression, task, options) => {
    tasks.push({ expression, task, options });
    return { stop: () => void stops.push(options.name) };
  };
  return { schedule, tasks, stops };
};

const silentLogger = () => {
  const lines: string[] = [];
  return { logger: createLogger({ write: (line) => lines.push(line) }), lines };
};

describe('startScheduler', () => {
  it('[EF-GML-03] schedules each job on its cron expression, in the configured time zone, never overlapping', () => {
    const { schedule, tasks } = captureSchedule();

    startScheduler({
      jobs: [{ name: 'gmail_sync', cron: '*/30 * * * *', run: () => Promise.resolve() }],
      timezone: 'Europe/Paris',
      logger: silentLogger().logger,
      schedule,
    });

    expect(tasks).toEqual([
      {
        expression: '*/30 * * * *',
        task: expect.any(Function),
        options: { timezone: 'Europe/Paris', name: 'gmail_sync', noOverlap: true },
      },
    ]);
  });

  it('[ENF-FIA-01] keeps scheduling after a run that throws, and journals the failure in the log', async () => {
    const { schedule, tasks } = captureSchedule();
    const { logger, lines } = silentLogger();
    const run = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('Gmail unreachable'))
      .mockResolvedValueOnce(undefined);
    startScheduler({ jobs: [{ name: 'gmail_sync', cron: '*/30 * * * *', run }], timezone: 'UTC', logger, schedule });

    await expect(tasks[0]?.task()).resolves.toBeUndefined();
    await expect(tasks[0]?.task()).resolves.toBeUndefined();

    expect(run).toHaveBeenCalledTimes(2);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
      level: 'error',
      message: 'scheduled job failed',
      job: 'gmail_sync',
      error: { message: 'Gmail unreachable' },
    });
  });

  it('[EF-GML-03] stops every job', async () => {
    const { schedule, stops } = captureSchedule();
    const scheduler = startScheduler({
      jobs: [
        { name: 'gmail_sync', cron: '*/30 * * * *', run: () => Promise.resolve() },
        { name: 'scraper', cron: '0 7 * * *', run: () => Promise.resolve() },
      ],
      timezone: 'UTC',
      logger: silentLogger().logger,
      schedule,
    });

    await scheduler.stop();

    expect(stops).toEqual(['gmail_sync', 'scraper']);
  });
});
