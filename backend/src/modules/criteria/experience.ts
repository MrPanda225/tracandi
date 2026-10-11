import { z } from 'zod';

/** RG-28 (v1.35): the level of a candidate or of an offer; « non précisé » is the absence of a level (null). */
export type Level = 'junior' | 'confirme' | 'senior';

const MONTHS_PER_YEAR = 12;
const MAX_YEARS = 50;
/** RG-28: junior from 0 to 2 years, confirmé from 3 to 7, senior from 8. */
const CONFIRMED_FROM_YEARS = 3;
const SENIOR_FROM_YEARS = 8;
/** A requirement beyond this is no requirement of experience, but a number of years about something else. */
const MAX_REQUIRED_YEARS = 50;
const NEARBY_CHARS = 90;
const YEAR_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

const monthIndexOf = (yearMonth: string): number => {
  const match = YEAR_MONTH.exec(yearMonth);
  if (!match) throw new RangeError('a period is dated YYYY-MM');
  return Number(match[1]) * MONTHS_PER_YEAR + Number(match[2]) - 1;
};

/**
 * One period of experience read in a CV, month to month, both months included; no end means it goes on (EF-VEI-43).
 * A malformed date is an error and not a silent miscount: the number of years is computed by the code, never guessed.
 */
export const PeriodSchema = z
  .object({
    start: z.string().regex(YEAR_MONTH, 'must be a month, YYYY-MM'),
    end: z.string().regex(YEAR_MONTH, 'must be a month, YYYY-MM').nullable(),
  })
  // A date the patterns above already refused is not compared: refinements still run after a failed pattern.
  .refine(
    (period) =>
      period.end === null ||
      !YEAR_MONTH.test(period.start) ||
      !YEAR_MONTH.test(period.end) ||
      monthIndexOf(period.end) >= monthIndexOf(period.start),
    { message: 'must not end before it starts', path: ['end'] },
  );

export type Period = z.infer<typeof PeriodSchema>;

/**
 * EF-VEI-43, RG-29: the years of professional experience of a CV — the months covered by its periods, a month covered
 * by two periods counted once, work-study contracts and internships included, rounded to the nearest whole year, from
 * 0 to 50. Computed here and never asked of a model, so that the same periods always give the same number.
 * @req EF-VEI-43, RG-29
 */
export const experienceYearsOfPeriods = (periods: readonly Period[], now: Date): number => {
  const nowIndex = now.getUTCFullYear() * MONTHS_PER_YEAR + now.getUTCMonth();
  const intervals = periods
    .map((period) => ({
      start: monthIndexOf(period.start),
      end: period.end === null ? nowIndex : monthIndexOf(period.end),
    }))
    .filter((interval) => interval.end >= interval.start)
    .sort((left, right) => left.start - right.start);
  let months = 0;
  let coveredUntil = Number.NEGATIVE_INFINITY;
  for (const { start, end } of intervals) {
    months += Math.max(0, end - Math.max(start, coveredUntil + 1) + 1);
    coveredUntil = Math.max(coveredUntil, end);
  }
  return Math.min(MAX_YEARS, Math.round(months / MONTHS_PER_YEAR));
};

/** EF-VEI-44, RG-28. */
export const levelOfYears = (years: number): Level =>
  years >= SENIOR_FROM_YEARS ? 'senior' : years >= CONFIRMED_FROM_YEARS ? 'confirme' : 'junior';

/** Lower case, no accent: « EXPÉRIENCE » and « experience » read alike. */
const plain = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

// « 5 ans », « 2 à 3 ans », « 4+ ans », « 8 années », « 3 years ».
// Not preceded by a digit, a point or a comma: « 1,5 an » is not 5 years, nor « 2.5 ans », nor « 100 ans » 0.
const YEARS = /(?<![\d.,])(\d{1,2})(?:\s*(?:a|-|et)\s*(\d{1,2}))?\s*\+?\s*(?:ans?|annees?|years?)\b/gu;
const EXPERIENCE_WORD = /experi/u;

/**
 * RG-29: the highest number of years an offer demands — an expression of the type « n ans d'expérience » or « n+ ans »,
 * the word « expérience » standing next to it, so that the age of a company is not taken for a requirement. Null when
 * the text states none.
 * @req RG-29
 */
export const requiredYearsOf = (text: string): number | null => {
  // Runs of spaces are one space: a text of twenty thousand of them costs one pass, not one per digit before them.
  const flat = plain(text).replace(/\s+/gu, ' ');
  let highest: number | null = null;
  for (const match of flat.matchAll(YEARS)) {
    const around = flat.slice(
      Math.max(0, match.index - NEARBY_CHARS),
      match.index + match[0].length + NEARBY_CHARS,
    );
    if (!EXPERIENCE_WORD.test(around)) continue;
    const years = Math.max(Number(match[1]), Number(match[2] ?? 0));
    if (years <= MAX_REQUIRED_YEARS) highest = Math.max(highest ?? 0, years);
  }
  return highest;
};

const TITLE_LEVELS: readonly (readonly [RegExp, Level])[] = [
  [/\b(?:junior|debutant)\b/u, 'junior'],
  [/\bconfirme\b/u, 'confirme'],
  [/\b(?:senior|lead|principal)\b/u, 'senior'],
];

/** RG-28: the level a job title states by a word of its own — junior, débutant, confirmé, senior, lead, principal. */
export const levelOfTitle = (title: string): Level | null => {
  const flat = plain(title);
  return TITLE_LEVELS.find(([word]) => word.test(flat))?.[1] ?? null;
};

/**
 * RG-28: the level of an offer — by the years its text demands when it states them, by its title otherwise, and
 * « non précisé » (null) when neither tells.
 * @req RG-28, RG-29
 */
export const levelOfOffer = ({ title, text }: { title: string; text: string }): Level | null => {
  const years = requiredYearsOf(text);
  return years === null ? levelOfTitle(title) : levelOfYears(years);
};
