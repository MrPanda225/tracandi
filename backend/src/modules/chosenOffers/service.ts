import type { Database } from '../../db/client.js';
import type { JobQueue, RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import { startOfParisDay } from '../../lib/parisTime.js';
import { buildExtractOfferTraitsPrompt } from '../../llm/prompts/extractOfferTraits.js';
import type { LlmRouter } from '../../llm/router.js';
import { withoutContacts } from '../../scraper/contacts.js';
import { requiredYearsOf } from '../criteria/experience.js';
import * as repository from './repository.js';
import {
  CHOSEN_OFFERS_PER_LEVEL,
  type ChooseOfferBody,
  type ChosenOfferView,
  type UpdateChosenOfferBody,
} from './schemas.js';
import { OfferTraitsAnswerSchema, suggestedLevelOf } from './traits.js';

const OFFER_NOT_FOUND = 'Cette offre choisie est introuvable.';
const levelFullMessage = (): string =>
  `Vous avez déjà ${String(CHOSEN_OFFERS_PER_LEVEL)} offres pour ce niveau : supprimez-en une pour en ajouter une autre.`;

export interface ChosenOffersService {
  /** @req EF-VEI-48 */
  list: (userId: number) => Promise<{ items: ChosenOfferView[]; maxPerLevel: number }>;
  /**
   * Checks the room left at the level and the allowance of the day, then queues the extraction of the traits and hands
   * back the run at once. The text is read from memory only: it is never written anywhere (ENF-RGP-14).
   * @throws HttpError 409 when the level holds 3 offers already, 429 after the allowance of the day.
   * @returns the identifier of the execution, to follow it (EF-EXE-03).
   * @req EF-VEI-48, EF-VEI-49
   */
  startExtraction: (userId: number, body: ChooseOfferBody) => Promise<number>;
  /**
   * The corrections of the candidate to the traits, the level included.
   * @throws NotFoundError when the offer is not the candidate's; HttpError 409 when the new level is full.
   * @req EF-VEI-49
   */
  update: (userId: number, id: number, body: UpdateChosenOfferBody) => Promise<ChosenOfferView>;
  /** @throws NotFoundError when the offer is not the candidate's. @req EF-VEI-48 */
  remove: (userId: number, id: number) => Promise<void>;
}

export interface ChosenOffersServiceDeps {
  db: Database;
  clock: Clock;
  queue: JobQueue;
  router: LlmRouter;
  /** ENF-COU-01: extractions per candidate and per day, Paris time; 0 lifts the limit. */
  extractionsPerDay: number;
}

/** What a chosen offer shows: its traits, and the level they point to, worked out from what is kept. */
export const viewOf = (row: repository.ChosenOfferRow): ChosenOfferView => ({
  id: row.id,
  level: row.level,
  title: row.title,
  keywords: row.keywords,
  years: row.years,
  suggestedLevel: suggestedLevelOf(row),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** ENF-COU-01: refuses a new extraction once the allowance of the day is spent; a failed one costs nothing. */
const checkAllowance = async (
  { queue, clock, extractionsPerDay }: ChosenOffersServiceDeps,
  userId: number,
): Promise<void> => {
  if (extractionsPerDay === 0) return;
  const today = await queue.countRunsSince(userId, 'offer_extraction', startOfParisDay(clock()));
  if (today >= extractionsPerDay) {
    throw new HttpError(
      429,
      `Vous avez lancé vos ${String(extractionsPerDay)} lectures d’offres du jour. Rendez-vous demain !`,
    );
  }
};

/**
 * The run of an extraction: the recruiter's contact details are taken out of the text, the model gives the title and
 * the keywords (the local one first: nobody waits at the screen, EF-IA-08), and the code reads the years the offer
 * demands (RG-29). Only these traits are kept (ENF-RGP-14).
 */
const extractionRun =
  (deps: ChosenOffersServiceDeps, { userId, level, text }: { userId: number } & ChooseOfferBody) =>
  async (): Promise<RunCounters> => {
    const offerText = withoutContacts(text);
    const { data } = await (deps.router.forMode?.('scheduled') ?? deps.router).runTask(
      'extract_offer_traits',
      {
        userId,
        ...buildExtractOfferTraitsPrompt({ offerText }),
        schema: OfferTraitsAnswerSchema,
      },
    );
    const row = await repository.insertChosenOffer(deps.db, {
      userId,
      level,
      traits: { title: data.title, keywords: data.keywords, years: requiredYearsOf(offerText) },
      now: deps.clock(),
      max: CHOSEN_OFFERS_PER_LEVEL,
    });
    if (!row) throw new HttpError(409, levelFullMessage());
    return {};
  };

/**
 * EF-VEI-48, EF-VEI-49: the offers a candidate chooses as models of their level — three at most per level, each read in
 * the queue, then kept as its traits alone.
 */
export const createChosenOffersService = (deps: ChosenOffersServiceDeps): ChosenOffersService => {
  const { db, queue, clock } = deps;
  /** Extractions asked for and not over yet, per candidate and level: they count against the three places. */
  const pending = new Map<string, number>();
  const keyOf = (userId: number, level: string): string => `${String(userId)}:${level}`;
  const pendingOf = (userId: number, level: string): number => pending.get(keyOf(userId, level)) ?? 0;
  const addPending = (userId: number, level: string, delta: number): void => {
    pending.set(keyOf(userId, level), Math.max(0, pendingOf(userId, level) + delta));
  };

  return {
    async list(userId) {
      return {
        items: (await repository.listChosenOffers(db, userId)).map(viewOf),
        maxPerLevel: CHOSEN_OFFERS_PER_LEVEL,
      };
    },

    async startExtraction(userId, body) {
      await checkAllowance(deps, userId);
      const held = await repository.countChosenOffersOfLevel(db, userId, body.level);
      if (held + pendingOf(userId, body.level) >= CHOSEN_OFFERS_PER_LEVEL) {
        throw new HttpError(409, levelFullMessage());
      }
      addPending(userId, body.level, 1);
      const run = extractionRun(deps, { userId, ...body });
      try {
        return await queue.enqueue({
          userId,
          job: 'offer_extraction',
          trigger: 'manual',
          run: () => run().finally(() => addPending(userId, body.level, -1)),
        });
      } catch (error) {
        addPending(userId, body.level, -1);
        throw error;
      }
    },

    async update(userId, id, body) {
      const { years, ...rest } = body;
      const row = await repository.updateChosenOffer(db, {
        userId,
        id,
        changes: { ...rest, ...(years !== undefined ? { years } : {}) },
        now: clock(),
        max: CHOSEN_OFFERS_PER_LEVEL,
      });
      if (row === 'full') throw new HttpError(409, levelFullMessage());
      if (!row) throw new NotFoundError(OFFER_NOT_FOUND);
      return viewOf(row);
    },

    async remove(userId, id) {
      if (!(await repository.deleteChosenOffer(db, userId, id))) throw new NotFoundError(OFFER_NOT_FOUND);
    },
  };
};
