import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { NotFoundError } from '../../lib/errors.js';
import * as repository from './repository.js';
import { type CandidateProfile, CandidateProfileSchema } from './schemas.js';

export interface ProfileService {
  /**
   * The reference profile of the user (EF-CVX-01).
   * @throws NotFoundError when none was saved yet, or when what is stored no longer matches the schema.
   */
  read: (userId: number) => Promise<CandidateProfile>;
  /** Replaces the profile with one already validated by its schema (EF-CVX-02). */
  replace: (userId: number, profile: CandidateProfile) => Promise<void>;
}

const NOT_SET = 'Aucun profil de référence enregistré : renseignez-le depuis l’Atelier CV.';
const UNREADABLE = 'Le profil de référence enregistré ne correspond plus au format attendu.';

/**
 * Reference profile of the candidate, single source of every CV (RG-12) and of the targets that score the offers
 * (RG-09). What is stored is parsed again on every read: a document written outside the application never reaches
 * a CV as it is.
 * @req EF-CVX-01, EF-CVX-02, RG-12, Q-16
 */
export const createProfileService = ({ db, clock }: { db: Database; clock: Clock }): ProfileService => ({
  async read(userId) {
    const stored = await repository.findProfileDocument(db, userId);
    if (stored === null) throw new NotFoundError(NOT_SET);
    const parsed = CandidateProfileSchema.safeParse(stored);
    if (!parsed.success) throw new NotFoundError(UNREADABLE);
    return parsed.data;
  },

  replace: (userId, profile) =>
    repository.saveProfileDocument(db, { userId, document: profile, updatedAt: clock() }),
});
