import { z } from 'zod';
import { experienceLevel } from '../../db/schema.js';
import { CRITERIA_CONTRACT_TYPES, CriteriaTargetSchema } from '../criteria/schemas.js';
import { experienceYearsOfPeriods, type Level, levelOfYears, PeriodSchema } from '../criteria/experience.js';
import { plainText, tidyKeywords } from './leniency.js';

/** EF-VEI-45: how many offers a deduction proposes at most; the schema of the targets bounds the rest (1 to 15 keywords). */
export const DEDUCED_TARGETS_MAX = 5;
const PERIODS_MAX = 40;
// A small model writes « présent » or « null » where the prompt asks for null: the same thing, not worth a second call.
const ONGOING = /^(?:present|en cours|aujourd'?hui|actuel(?:le)?|now|current|null|none)$/u;
// « 2023-9 », « 2023/09 », « 09/2023 », « 9/2023 »: a month written another way is the same month, never a guess.
const MONTH_FORMATS: readonly [RegExp, (match: RegExpExecArray) => string][] = [
  [/^(\d{4})[-/](\d{1,2})$/u, (match) => `${match[1] ?? ''}-${(match[2] ?? '').padStart(2, '0')}`],
  [/^(\d{1,2})[-/](\d{4})$/u, (match) => `${match[2] ?? ''}-${(match[1] ?? '').padStart(2, '0')}`],
];

/** The month as YYYY-MM when it is written in one of the usual ways; anything else is left to the schema to refuse. */
const monthOf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  for (const [pattern, format] of MONTH_FORMATS) {
    const match = pattern.exec(text);
    if (match) return format(match);
  }
  return text;
};

/**
 * A period as a model writes it: an experience that goes on may end with a word instead of null, and a month may be
 * written 09/2023. A period that is still wrong is refused, and with it the whole answer: a year miscounted in silence
 * is worse than a second provider (RG-29).
 */
const ModelPeriodSchema = z
  .object({
    start: z.preprocess(monthOf, z.string()),
    end: z.preprocess(
      (end) => (typeof end === 'string' && ONGOING.test(plainText(end)) ? null : monthOf(end)),
      z.string().nullable(),
    ),
  })
  .pipe(PeriodSchema);

/** The level a model writes, as the enumeration spells it: « Confirmé » is « confirme ». */
const levelOf = (value: unknown): unknown => (typeof value === 'string' ? plainText(value) : value);

/** The contracts a model lists, those it knows only: a made-up « cdn » costs the offer nothing else. */
const knownContracts = (value: unknown): unknown =>
  Array.isArray(value)
    ? [...new Set(value.flatMap((item) => (typeof item === 'string' ? [plainText(item)] : [])))].filter(
        (item) => (CRITERIA_CONTRACT_TYPES as readonly string[]).includes(item),
      )
    : value;

/** What the model writes of an offer: an unusable level is not a reason to lose the offer, the code gives one. */
const ModelTargetSchema = z.object({
  label: CriteriaTargetSchema.shape.label,
  keywords: z.preprocess(tidyKeywords, CriteriaTargetSchema.shape.keywords),
  contractTypes: z.preprocess(knownContracts, CriteriaTargetSchema.shape.contractTypes),
  level: z.preprocess(levelOf, z.enum(experienceLevel.enumValues).nullable().catch(null)),
});

/** The offers that are well formed, five at most: one that is not is left out and the others are kept. */
const keepWellFormed = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const parsed = ModelTargetSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : value;

/**
 * EF-VEI-43, EF-VEI-45: what the model answers when it reads a CV type — the periods of the experiences and the offers
 * to look for. There is no place for a number of years: a model that volunteers one is not read (the schema drops it),
 * and the code counts the years from the periods (RG-29). An offer that is malformed is left out of the proposal; an
 * answer with none left, or with a period that is wrong, is refused (EF-IA-03).
 */
export const ProfileDeductionAnswerSchema = z.object({
  periods: z.array(ModelPeriodSchema).max(PERIODS_MAX),
  targets: z.preprocess(keepWellFormed, z.array(ModelTargetSchema).min(1)),
});

export type ProfileDeductionAnswer = z.infer<typeof ProfileDeductionAnswerSchema>;

/** EF-VEI-45: an offer a CV type points to, in the shape of the targets (EF-VEI-29), with the level of the job. */
export const DeducedTargetSchema = CriteriaTargetSchema.extend({ level: z.enum(experienceLevel.enumValues) });
export type DeducedTarget = z.infer<typeof DeducedTargetSchema>;

/** What a CV type is worked out to be: years and level by the code, offers by the model. */
export interface ProfileDeduction {
  years: number;
  level: Level;
  targets: DeducedTarget[];
}

/**
 * The years of experience from the periods, the level from the years (RG-28, RG-29), and the offers as proposed — the
 * first five. An offer whose level the model could not write gets the level of the candidate.
 * @req EF-VEI-43, EF-VEI-44, EF-VEI-45
 */
export const buildProfileDeduction = (answer: ProfileDeductionAnswer, now: Date): ProfileDeduction => {
  const years = experienceYearsOfPeriods(answer.periods, now);
  const level = levelOfYears(years);
  return {
    years,
    level,
    targets: answer.targets
      .slice(0, DEDUCED_TARGETS_MAX)
      .map((target) => ({ ...target, level: target.level ?? level })),
  };
};
