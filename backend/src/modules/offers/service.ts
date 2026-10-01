import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { adapterFor } from '../../scraper/adapters/index.js';
import { createApplicationFromOffer } from '../applications/service.js';
import * as repository from './repository.js';
import type { OfferRow } from './repository.js';
import type { OfferDetail, OfferQuery, OfferView, UpdateOfferBody } from './schemas.js';

const OFFER_NOT_FOUND = 'Offre introuvable';
const ALREADY_APPLIED = 'Vous avez déjà déclaré avoir postulé à cette offre.';
const CONFLICT = 409;

export interface OffersService {
  /** @req EF-VEI-16, EF-VEI-17, EF-VEI-18, EF-VEI-22 */
  list: (userId: number, query: OfferQuery) => Promise<{ items: OfferView[]; total: number }>;
  /** @throws NotFoundError @req EF-VEI-16 */
  get: (userId: number, id: number) => Promise<OfferDetail>;
  /** @throws NotFoundError; HttpError 409 on an offer already applied to @req EF-VEI-18 */
  setStatus: (userId: number, id: number, body: UpdateOfferBody) => Promise<OfferView>;
  /**
   * The offer becomes « postulée » and an application « Envoyée » is created from it, in one transaction.
   * @throws NotFoundError; HttpError 409 when already applied, or when the company has this job title already.
   * @req EF-VEI-19, EF-VEI-20
   */
  apply: (userId: number, id: number) => Promise<{ offer: OfferView; applicationId: number }>;
}

const viewOf = (row: OfferRow): OfferView => ({
  id: row.id,
  title: row.title,
  companyName: row.companyName,
  location: row.location,
  contractType: row.contractType,
  url: row.url,
  postedAt: row.postedAt?.toISOString() ?? null,
  firstSeenAt: row.firstSeenAt.toISOString(),
  relevanceScore: row.relevanceScore,
  relevanceReason: row.relevanceReason,
  matchedTarget: row.matchedTarget,
  status: row.status,
  source: { adapter: row.adapter, label: adapterFor(row.adapter).label },
  applicationId: row.applicationId,
});

/**
 * The offers the watch found, as the candidate sorts them out (EF-VEI-16 to EF-VEI-20).
 * @req EF-VEI-16 to EF-VEI-20, EF-VEI-22, EF-AUT-06
 */
export const createOffersService = ({ db, clock }: { db: Database; clock: Clock }): OffersService => {
  const readOwned = async (userId: number, id: number) => {
    const row = await repository.findOffer(db, userId, id);
    if (!row) throw new NotFoundError(OFFER_NOT_FOUND);
    return row;
  };

  return {
    async list(userId, query) {
      const { rows, total } = await repository.listOffers(db, userId, query);
      return { items: rows.map(viewOf), total };
    },

    async get(userId, id) {
      const row = await readOwned(userId, id);
      return { ...viewOf(row), description: row.description };
    },

    async setStatus(userId, id, body) {
      const row = await readOwned(userId, id);
      // EF-VEI-19: an offer applied to stays so; its application is followed on the Candidatures screen.
      if (row.status === 'applied') throw new HttpError(CONFLICT, ALREADY_APPLIED);
      await repository.setOfferStatus(db, id, body.status);
      return viewOf(await readOwned(userId, id));
    },

    async apply(userId, id) {
      const row = await readOwned(userId, id);
      if (row.status === 'applied') throw new HttpError(CONFLICT, ALREADY_APPLIED);
      const applicationId = await db.transaction(async (tx) => {
        const created = await createApplicationFromOffer(tx, {
          userId,
          offerId: id,
          companyName: row.companyName,
          jobTitle: row.title,
          contractType: row.contractType,
          appliedAt: clock(),
        });
        await repository.setOfferStatus(tx, id, 'applied');
        return created;
      });
      return { offer: viewOf(await readOwned(userId, id)), applicationId };
    },
  };
};
