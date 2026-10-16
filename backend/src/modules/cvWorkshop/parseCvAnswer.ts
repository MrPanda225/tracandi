import { z } from 'zod';

// Bounds of what a model may list: a CV is not a book, and the cost of a call stays bounded (ENF-COU-01).
export const PARSED_EXPERIENCES_MAX = 20;
export const PARSED_BULLETS_MAX = 12;
export const PARSED_LIST_ITEMS_MAX = 60;
const REF_TEXT_MAX = 400;

/**
 * A pointer to the source: the line (or the lines, for a fact that wraps) and what is written there. The text is only
 * used to find the fact on the line; the code copies the source, never this text (RG-21).
 */
const RefSchema = z
  .object({
    line: z.coerce.number().int().min(1),
    toLine: z.preprocess((value) => value ?? undefined, z.coerce.number().int().min(1).optional()),
    text: z.string().trim().min(1).max(REF_TEXT_MAX),
  })
  .strict();
export type CvRef = z.infer<typeof RefSchema>;

// A small model writes « null » where nothing is asked, or a malformed pointer: the pointer is left out, not the answer.
const optionalRef = z.preprocess(
  (value) => (RefSchema.safeParse(value).success ? value : null),
  RefSchema.nullable(),
);

/** The pointers that are well formed, at most `max`: one that is not is left out and the others are kept. */
const refList = (max: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.filter((item) => RefSchema.safeParse(item).success).slice(0, max)
        : value ?? [],
    z.array(RefSchema).max(max),
  );

/** The entries that are well formed, at most `max`: an entry without a usable title or degree is left out. */
const entryList = <T extends z.ZodTypeAny>(entry: T, max: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.filter((item) => entry.safeParse(item).success).slice(0, max)
        : value ?? [],
    z.array(entry).max(max),
  );

const ExperienceSchema = z
  .object({
    title: RefSchema,
    organization: optionalRef,
    place: optionalRef,
    dates: optionalRef,
    bullets: refList(PARSED_BULLETS_MAX),
  })
  .strict();

const EducationSchema = z
  .object({
    degree: RefSchema,
    school: optionalRef,
    place: optionalRef,
    dates: optionalRef,
    details: refList(PARSED_BULLETS_MAX),
  })
  .strict();

/**
 * EF-CVX-46: what the `parse_cv` task answers — references to the numbered lines of the CV, never text of its own.
 * Malformed pointers and entries are left out one by one; the code anchors the rest (RG-21).
 */
export const ParseCvAnswerSchema = z
  .object({
    headline: optionalRef,
    profile: refList(PARSED_LIST_ITEMS_MAX),
    experiences: entryList(ExperienceSchema, PARSED_EXPERIENCES_MAX),
    education: entryList(EducationSchema, PARSED_EXPERIENCES_MAX),
    skills: refList(PARSED_LIST_ITEMS_MAX),
    certifications: refList(PARSED_LIST_ITEMS_MAX),
    languages: refList(PARSED_LIST_ITEMS_MAX),
    interests: refList(PARSED_LIST_ITEMS_MAX),
  })
  .strict();
export type ParseCvAnswer = z.infer<typeof ParseCvAnswerSchema>;
