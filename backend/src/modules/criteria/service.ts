import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import type { ScoringProfile } from '../../llm/prompts/scoreOffers.js';
import { type Place, type PlaceFinder, PlaceLookupError } from '../../scraper/official/geo.js';
import * as repository from './repository.js';
import { type WatchCriteria, WatchCriteriaSchema } from './schemas.js';

const BAD_GATEWAY = 502;

export interface CriteriaService {
  /** The saved criteria, or null when the candidate has none yet. @req EF-VEI-29 */
  read: (userId: number) => Promise<WatchCriteria | null>;
  /** Replaces the criteria; the value is the one read back. @req EF-VEI-29 */
  save: (userId: number, criteria: WatchCriteria) => Promise<WatchCriteria>;
  /**
   * @throws HttpError 502 when the public service of the communes cannot answer.
   * @req EF-VEI-30
   */
  findPlaces: (query: string) => Promise<Place[]>;
}

export interface CriteriaServiceDeps {
  db: Database;
  clock: Clock;
  places: PlaceFinder;
  logger: Logger;
}

/**
 * EF-VEI-29, EF-VEI-30: the search criteria of each candidate. A stored document that no longer passes the
 * schema is treated as absent, never handed on: the watch then asks for criteria again rather than querying the
 * official sources with values nobody checked.
 */
export const createCriteriaService = ({
  db,
  clock,
  places,
  logger,
}: CriteriaServiceDeps): CriteriaService => {
  const read = async (userId: number): Promise<WatchCriteria | null> => {
    const document = await repository.findCriteriaDocument(db, userId);
    if (document === null) return null;
    const parsed = WatchCriteriaSchema.safeParse(document);
    if (!parsed.success) {
      logger.warn('stored watch criteria no longer valid', { userId });
      return null;
    }
    return parsed.data;
  };

  return {
    read,

    async save(userId, criteria) {
      await repository.saveCriteriaDocument(db, { userId, document: criteria, updatedAt: clock() });
      return (await read(userId)) ?? criteria;
    },

    async findPlaces(query) {
      try {
        return await places(query);
      } catch (failure) {
        if (failure instanceof PlaceLookupError) throw new HttpError(BAD_GATEWAY, failure.message);
        throw failure;
      }
    },
  };
};

/**
 * EF-VEI-31, RG-09: the criteria as the scoring prompt states them — the targets, and where the candidate can
 * work in plain words.
 * @req EF-VEI-31, RG-09
 */
export const scoringProfileOf = (criteria: WatchCriteria): ScoringProfile => {
  const where = criteria.place
    ? `${criteria.place.name} (${criteria.place.departmentCode}) et ${criteria.radiusKm} km autour`
    : 'toute la France';
  return {
    searchArea: `${where}${criteria.acceptsRemote ? ', ou en télétravail' : ' ; télétravail non recherché'}`,
    targets: criteria.targets.map((target) => ({
      label: target.label,
      contractTypes: target.contractTypes,
      keywords: target.keywords,
    })),
  };
};
