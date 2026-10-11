import { describe, expect, it, vi } from 'vitest';
import type { JobQueue } from '../../jobs/queue.js';
import type { Logger } from '../../lib/logger.js';
import { createScheduledWatch } from './scheduled.js';

const mocks = vi.hoisted(() => ({
  purgeStaleOffers: vi.fn<() => Promise<number>>(),
  listUsersAtSlot: vi.fn<() => Promise<number[]>>(),
}));

vi.mock('./repository.js', () => ({ purgeStaleOffers: mocks.purgeStaleOffers }));
vi.mock('../autowatch/repository.js', () => ({ listUsersAtSlot: mocks.listUsersAtSlot }));

const setup = (hasTargets: (userId: number) => Promise<boolean> = () => Promise.resolve(true)) => {
  const queue = {
    enqueueUnlessPending: vi.fn(() => Promise.resolve(1)),
    recordSkipped: vi.fn(() => Promise.resolve()),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const watch = createScheduledWatch({
    db: {} as never,
    clock: () => new Date('2026-09-22T05:00:00.000Z'),
    queue: queue as unknown as JobQueue,
    logger: logger as unknown as Logger,
    hasTargets,
    workFor: (userId, slot) => ({
      userId,
      slot,
      job: 'scraper',
      trigger: 'schedule',
      run: () => Promise.resolve({}),
    }),
  });
  return { watch, queue, logger };
};

describe('createScheduledWatch (review of the lot 10)', () => {
  it('[ENF-FIA-02] starts the passes of every candidate even when the purge of old offers fails', async () => {
    mocks.purgeStaleOffers.mockRejectedValue(new Error('purge failed'));
    mocks.listUsersAtSlot.mockResolvedValue([1, 2]);
    const { watch, queue, logger } = setup();

    await watch.run();

    expect(queue.enqueueUnlessPending).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('stale offers could not be purged', expect.anything());
  });

  it('[EF-VEI-55] records a pass as ignored, with the reason, for a candidate who has nothing to search for', async () => {
    mocks.purgeStaleOffers.mockResolvedValue(0);
    mocks.listUsersAtSlot.mockResolvedValue([7]);
    const { watch, queue } = setup(() => Promise.resolve(false));

    await watch.run();

    expect(queue.enqueueUnlessPending).not.toHaveBeenCalled();
    expect(queue.recordSkipped).toHaveBeenCalledWith(
      { userId: 7, job: 'scraper', trigger: 'schedule', slot: 'morning' },
      expect.stringContaining('critères de recherche'),
    );
  });

  it('[ENF-FIA-02] does not record a failure of the database as « no criteria », and goes on with the other candidates', async () => {
    mocks.purgeStaleOffers.mockResolvedValue(0);
    mocks.listUsersAtSlot.mockResolvedValue([7, 8]);
    const { watch, queue, logger } = setup((userId) =>
      userId === 7 ? Promise.reject(new Error('connection terminated')) : Promise.resolve(true),
    );

    await watch.run();

    expect(queue.recordSkipped).not.toHaveBeenCalled();
    expect(queue.enqueueUnlessPending).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('scheduled watch could not be started', expect.anything());
  });
});
