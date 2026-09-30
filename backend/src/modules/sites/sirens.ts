import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import type { SirenFinder } from '../../scraper/official/companySearch.js';
import * as repository from './repository.js';

/** ENF-COL-05, ENF-COU-01: companies looked for in one pass; the others wait for the next ones. */
const COMPANIES_PER_PASS = 10;
/** A company not found is looked for again a month later: its name may have been corrected meanwhile. */
const RETRY_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export interface SirenResolver {
  /**
   * Looks for the SIREN of a few companies of the candidate's applications. A failure is logged and never stops the
   * watch: the SIREN only sharpens EF-VEI-35, the company key does the rest.
   * @req EF-VEI-36
   */
  resolve: (userId: number) => Promise<void>;
}

/** EF-VEI-36: the SIREN of the companies the candidate applied to, found little by little. */
export const createSirenResolver = ({
  db,
  clock,
  findSiren,
  logger,
}: {
  db: Database;
  clock: Clock;
  findSiren: SirenFinder;
  logger: Logger;
}): SirenResolver => ({
  async resolve(userId) {
    const now = clock();
    const pending = await repository.listCompaniesToIdentify(db, userId, {
      before: new Date(now.getTime() - RETRY_AFTER_MS),
      limit: COMPANIES_PER_PASS,
    });
    // One after the other: the client paces the API anyway (ENF-COL-05).
    for (const company of pending) {
      try {
        await repository.recordSiren(db, company.id, {
          siren: await findSiren(company.name),
          checkedAt: now,
        });
      } catch (error) {
        logger.warn('siren lookup failed', { companyId: company.id, error });
      }
    }
  },
});
