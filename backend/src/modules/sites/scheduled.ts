import type { Database } from '../../db/client.js';
import type { JobQueue, QueuedWork } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import * as automaticWatch from '../autowatch/repository.js';
import { slotAt, type WatchSlot } from '../autowatch/slots.js';
import * as repository from './repository.js';

/** ENF-RGP-10 (v1.33): an offer neither kept nor applied to is removed 60 days after its source stopped publishing it. */
const OFFER_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = 'Europe/Paris';

/** EF-VEI-55: what the settings tell a candidate whose pass was ignored for want of anything to search for. */
const PASS_WITHOUT_CRITERIA =
  'Passage ignoré : enregistrez vos critères de recherche (ou validez votre profil) pour que la veille sache quoi chercher.';

export interface ScheduledWatchDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  logger: Logger;
  /** EF-VEI-51: the time zone whose hour gives the slot of a pass; the scheduler's. */
  timezone?: string | undefined;
  /** EF-VEI-55: whether the candidate has criteria, or a profile whose targets stand for them (EF-VEI-31). */
  hasTargets: (userId: number) => Promise<boolean>;
  /** The pass of a candidate, as the queue runs it, recorded under its slot. */
  workFor: (userId: number, slot: WatchSlot) => QueuedWork;
}

/** ENF-RGP-10: the daily purge. A purge that fails is logged and goes no further: the passes of the candidates must start. */
const purgeStaleOffers = async ({ db, clock, logger }: ScheduledWatchDeps): Promise<void> => {
  try {
    const removed = await repository.purgeStaleOffers(db, new Date(clock().getTime() - OFFER_RETENTION_MS));
    if (removed > 0) logger.info('stale offers removed', { removed });
  } catch (error) {
    logger.warn('stale offers could not be purged', { error });
  }
};

/**
 * EF-VEI-06, EF-VEI-51: what the clock starts at each of its three o'clock — the pass of every candidate who
 * activated their watch and ticked the slot (EF-CFG-07).
 */
export const createScheduledWatch = (deps: ScheduledWatchDeps) => {
  const { db, clock, queue, logger } = deps;

  /**
   * EF-VEI-55, EF-EXE-08: the pass of one candidate at one slot. Without anything to search for it is recorded as
   * ignored, with the reason; with a pass of theirs still waiting or running it is recorded as ignored too, and
   * what that one leaves unscored is taken up at the next slot (EF-VEI-54).
   */
  const startPass = async (userId: number, slot: WatchSlot): Promise<void> => {
    if (!(await deps.hasTargets(userId))) {
      await queue.recordSkipped({ userId, job: 'scraper', trigger: 'schedule', slot }, PASS_WITHOUT_CRITERIA);
      return;
    }
    const runId = await queue.enqueueUnlessPending(deps.workFor(userId, slot));
    if (runId === null) logger.info('scheduled watch skipped, one is already queued', { userId, slot });
  };

  return {
    async run(): Promise<void> {
      // ENF-RGP-10: three times a day, so at least once a day.
      await purgeStaleOffers(deps);
      const slot = slotAt(clock(), deps.timezone ?? DEFAULT_TIMEZONE);
      for (const userId of await automaticWatch.listUsersAtSlot(db, slot)) {
        try {
          await startPass(userId, slot);
        } catch (error) {
          // ENF-FIA-02: the pass of one candidate never stops the passes of the others.
          logger.warn('scheduled watch could not be started', { userId, slot, error });
        }
      }
    },
  };
};
