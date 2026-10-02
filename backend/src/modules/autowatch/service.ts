import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { startOfParisDay } from '../../lib/parisTime.js';
import * as repository from './repository.js';
import type { AutomaticWatch, AutomaticWatchBody } from './schemas.js';

export interface AutomaticWatchService {
  /** The choice of the candidate and the scheduled passes of today. @req EF-CFG-07, EF-CFG-08 */
  read: (userId: number) => Promise<AutomaticWatch>;
  /** Replaces the choice; the value is the one read back. @req EF-CFG-07 */
  save: (userId: number, body: AutomaticWatchBody) => Promise<AutomaticWatch>;
}

export interface AutomaticWatchServiceDeps {
  db: Database;
  clock: Clock;
}

/**
 * EF-CFG-07, EF-CFG-08: the settings of the watch that runs by itself, and what its passes did today. A pass tells
 * its slot, its state and its counters, and why when it was ignored — nothing of what it read (ENF-RGP-12). « Today »
 * is the Paris day, as for the other daily allowances (EF-CVX-33).
 */
export const createAutomaticWatchService = ({
  db,
  clock,
}: AutomaticWatchServiceDeps): AutomaticWatchService => {
  const read = async (userId: number): Promise<AutomaticWatch> => {
    const [settings, passes] = await Promise.all([
      repository.findSettings(db, userId),
      repository.listPassesSince(db, { userId, since: startOfParisDay(clock()) }),
    ]);
    return {
      ...settings,
      passes: passes.map(({ error, startedAt, finishedAt, ...pass }) => ({
        ...pass,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt?.toISOString() ?? null,
        message: error,
      })),
    };
  };

  return {
    read,

    async save(userId, body) {
      await repository.saveSettings(db, { userId, enabled: body.enabled, slots: body.slots });
      return read(userId);
    },
  };
};
