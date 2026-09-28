import { z } from 'zod';
import { type AdaptedCv, AdaptedCvSchema } from './adaptedCv.js';
import { cites, foldText, numbersIn } from './text.js';

const SECTION_MAX_LENGTH = 80;
const TEXT_MAX_LENGTH = 600;
const REASON_MAX_LENGTH = 300;
/** EF-CVX-29: changes listed at most, enough for a two-page CV. */
const MAX_CHANGES = 30;

/** EF-CVX-29: one change of the adapted CV — where, what it was, what it became, and why for this offer. */
const ChangeSchema = z.object({
  section: z.string().trim().min(1).max(SECTION_MAX_LENGTH),
  before: z.string().trim().max(TEXT_MAX_LENGTH),
  after: z.string().trim().min(1).max(TEXT_MAX_LENGTH),
  reason: z.string().trim().min(1).max(REASON_MAX_LENGTH),
});

/** What the `tailor_cv` task answers: the adapted CV and the list of its changes. */
export const TailoredAnswerSchema = z.object({ cv: AdaptedCvSchema, changes: z.array(ChangeSchema).max(MAX_CHANGES) });
export type TailoredAnswer = z.infer<typeof TailoredAnswerSchema>;
export type CvChange = z.infer<typeof ChangeSchema>;

type FieldPath = (string | number)[];

// « 09 » and « 9 » are the same figure.
const figure = (digits: string): string => digits.replace(/^0+(?=\d)/u, '');
// « Anglais : courant », « Anglais (C1) »: the language is what comes before the level.
const languageOf = (item: string): string => item.split(/[:(,\-–—]/u)[0]?.trim() ?? item;

/**
 * RG-21: the fields of an adapted CV that say something the imported CV does not. Companies, schools, job titles,
 * degrees, places and dates must be cited as they are; skills, tools, certifications, languages and interests must be
 * cited; any figure written anywhere must be one of the CV's. Wording is free: a rephrased achievement passes when it
 * adds no figure. Paths only — never the values, which are the candidate's (ENF-SEC-08).
 * @req RG-21, EF-CVX-26
 */
const unfaithfulPaths = (cv: AdaptedCv, sourceText: string): FieldPath[] => {
  const source = foldText(sourceText);
  const sourceFigures = new Set(numbersIn(sourceText).map(figure));
  const paths: FieldPath[] = [];
  const mustCite = (value: string | null, path: FieldPath) => {
    if (value !== null && !cites(source, value)) paths.push(path);
  };
  const addsNoFigure = (value: string | null, path: FieldPath) => {
    if (value !== null && numbersIn(value).some((digits) => !sourceFigures.has(figure(digits)))) paths.push(path);
  };

  addsNoFigure(cv.headline, ['headline']);
  addsNoFigure(cv.profile, ['profile']);
  cv.experiences.forEach((experience, index) => {
    const at = ['experiences', index];
    mustCite(experience.title, [...at, 'title']);
    mustCite(experience.organization, [...at, 'organization']);
    mustCite(experience.place, [...at, 'place']);
    mustCite(experience.dates, [...at, 'dates']);
    experience.bullets.forEach((bullet, bulletIndex) => addsNoFigure(bullet, [...at, 'bullets', bulletIndex]));
  });
  cv.education.forEach((entry, index) => {
    const at = ['education', index];
    mustCite(entry.degree, [...at, 'degree']);
    mustCite(entry.school, [...at, 'school']);
    mustCite(entry.place, [...at, 'place']);
    mustCite(entry.dates, [...at, 'dates']);
    addsNoFigure(entry.detail, [...at, 'detail']);
  });
  for (const key of ['skills', 'certifications', 'interests'] as const) {
    cv[key].forEach((item, index) => mustCite(item, [key, index]));
  }
  cv.languages.forEach((item, index) => mustCite(languageOf(item), ['languages', index]));
  return paths;
};

/**
 * The schema the answer of `tailor_cv` must meet for this CV: well formed (EF-IA-03) and faithful to the imported CV
 * (RG-21). An unfaithful answer is rejected like a malformed one, so the router asks the next provider (EF-IA-02) and
 * the candidate never sees it (EF-CVX-26).
 * @req EF-CVX-26, EF-CVX-29, RG-21
 */
export const tailoredAnswerSchemaFor = (sourceText: string) =>
  TailoredAnswerSchema.superRefine((answer, context) => {
    for (const path of unfaithfulPaths(answer.cv, sourceText)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['cv', ...path], message: 'Not in the imported CV (RG-21)' });
    }
  });
