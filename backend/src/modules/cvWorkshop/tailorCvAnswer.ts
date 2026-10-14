import { z } from 'zod';
import { PARSED_BULLETS_MAX, PARSED_EXPERIENCES_MAX, PARSED_LIST_ITEMS_MAX } from './parseCvAnswer.js';

// Bounds of what the model may write: the free texts only; every fact is an id of the parsed CV (ENF-COU-01).
const HEADLINE_MAX_LENGTH = 200;
const PROFILE_MAX_LENGTH = 1_200;
const BULLET_MAX_LENGTH = 300;
const REASON_MAX_LENGTH = 300;
/** EF-CVX-29: changes listed at most, enough for a two-page CV. */
export const MAX_CHANGES = 30;

/** A text the model may leave out: anything that is not a usable string becomes null instead of failing the answer. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' && value.trim().length <= max ? value.trim() : null),
    z.string().nullable(),
  );

const texts = (max: number, length: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value
            .filter((item): item is string => typeof item === 'string' && item.trim() !== '' && item.trim().length <= max)
            .map((item) => item.trim())
            .slice(0, length)
        : [],
    z.array(z.string()),
  );

const idList = texts(40, PARSED_LIST_ITEMS_MAX);

/** The entries of an array that are well formed, at most `max`; anything that is not an array stays invalid. */
const entryList = <T extends z.ZodTypeAny>(entry: T, max: number) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.filter((item) => entry.safeParse(item).success).slice(0, max) : value),
    z.array(entry),
  );

const ExperienceChoiceSchema = z.object({
  id: z.string().regex(/^exp_\d+$/u),
  bullets: texts(BULLET_MAX_LENGTH, PARSED_BULLETS_MAX),
});

const EducationChoiceSchema = z.object({
  id: z.string().regex(/^edu_\d+$/u),
  details: idList,
});

const ChangeTargetSchema = z.object({
  target: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
});

/**
 * EF-CVX-47: what the `tailor_cv` task answers — the free texts it writes (headline, profile, rewritten bullets) and
 * the ids of the facts it keeps; never a title, company, place, date, degree, school or list item. Tolerant on shape
 * (an unusable field is left out, extra fields are dropped), strict on caps. An answer without its `experiences`
 * array is not an answer. Unknown ids are ignored by the assembly (RG-21).
 */
export const TailorCvAnswerSchema = z.object({
  headline: optionalText(HEADLINE_MAX_LENGTH),
  profile: optionalText(PROFILE_MAX_LENGTH),
  experiences: entryList(ExperienceChoiceSchema, PARSED_EXPERIENCES_MAX),
  education: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    entryList(EducationChoiceSchema, PARSED_EXPERIENCES_MAX),
  ),
  skills: idList,
  certifications: idList,
  languages: idList,
  interests: idList,
  changes: z.preprocess((value) => (Array.isArray(value) ? value : []), entryList(ChangeTargetSchema, MAX_CHANGES)),
});
export type TailorCvAnswer = z.infer<typeof TailorCvAnswerSchema>;
