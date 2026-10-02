import { z } from 'zod';
import { experienceLevel } from '../../db/schema.js';
import { CriteriaTargetSchema } from '../criteria/schemas.js';
import { experienceYearsOfPeriods, type Level, levelOfYears, PeriodSchema } from '../criteria/experience.js';

/** EF-VEI-45: how many offers a deduction proposes at most; the schema of the targets bounds the rest (1 to 15 keywords). */
export const DEDUCED_TARGETS_MAX = 5;
const PERIODS_MAX = 40;
// A small model writes « présent » where the prompt asks for null: it is the same thing and not worth a second call.
const ONGOING = /^(?:present|en cours|aujourd'?hui|actuel(?:le)?|now|current)$/u;

const plain = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** A period as a model writes it: an experience that goes on may end with a word instead of null. */
const ModelPeriodSchema = z
  .object({
    start: z.string(),
    end: z.preprocess(
      (end) => (typeof end === 'string' && ONGOING.test(plain(end)) ? null : end),
      z.string().nullable(),
    ),
  })
  .pipe(PeriodSchema);

/** EF-VEI-45: an offer a CV type points to, in the shape of the targets (EF-VEI-29), with the level of the job. */
export const DeducedTargetSchema = CriteriaTargetSchema.extend({ level: z.enum(experienceLevel.enumValues) });

/**
 * EF-VEI-43, EF-VEI-45: what the model answers when it reads a CV type — the periods of the experiences and the offers
 * to look for. There is no place for a number of years: a model that volunteers one is not read (the schema drops it),
 * and the code counts the years from the periods (RG-29). An answer outside this schema is refused (EF-IA-03).
 */
export const ProfileDeductionAnswerSchema = z.object({
  periods: z.array(ModelPeriodSchema).max(PERIODS_MAX),
  targets: z.array(DeducedTargetSchema).min(1).max(DEDUCED_TARGETS_MAX),
});

export type ProfileDeductionAnswer = z.infer<typeof ProfileDeductionAnswerSchema>;
export type DeducedTarget = z.infer<typeof DeducedTargetSchema>;

/** What a CV type is worked out to be: years and level by the code, offers by the model. */
export interface ProfileDeduction {
  years: number;
  level: Level;
  targets: DeducedTarget[];
}

/**
 * The years of experience from the periods, the level from the years (RG-28, RG-29), and the offers as proposed.
 * @req EF-VEI-43, EF-VEI-44, EF-VEI-45
 */
export const buildProfileDeduction = (answer: ProfileDeductionAnswer, now: Date): ProfileDeduction => {
  const years = experienceYearsOfPeriods(answer.periods, now);
  return { years, level: levelOfYears(years), targets: answer.targets };
};
