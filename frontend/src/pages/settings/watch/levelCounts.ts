import type { ChosenOffer } from '../../../api/chosenOffers';
import type { ExperienceLevel } from '../../../api/criteria';

/** How many offers each level holds. */
export type LevelCounts = Readonly<Record<ExperienceLevel, number>>;

/** EF-VEI-48: three offers at most per level, so the screen counts what each level holds. */
export const countsOf = (offers: readonly ChosenOffer[]): LevelCounts => ({
  junior: offers.filter((offer) => offer.level === 'junior').length,
  confirme: offers.filter((offer) => offer.level === 'confirme').length,
  senior: offers.filter((offer) => offer.level === 'senior').length,
});
