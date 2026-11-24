import type { AdaptedCv } from './adaptedCv.js';
import { keysOf } from './anchoring.js';
import { cites, datesIn, durationsIn, figuresIn, foldText } from './text.js';

type FieldPath = (string | number)[];

/** Whether the tokens of a fact appear in the source, in order, whatever is skipped between them (punctuation ignored). */
const isInSource = (sourceKeys: readonly string[], fact: string): boolean => {
  let cursor = 0;
  for (const key of keysOf(fact)) {
    const found = sourceKeys.indexOf(key, cursor);
    if (found === -1) return false;
    cursor = found + 1;
  }
  return true;
};

/**
 * RG-21, EF-CVX-47: the test every free text of the model (headline, sentence of the profile, bullet) must pass to be
 * shown. It fails when the text cites a figure the source does not carry (the day and month of a date are no figures),
 * a date « month/year » the source does not write, a duration (« 5 ans », « cinq ans d'expérience ») the source does
 * not state as such, or a skill of `missingSkills` — those the diagnostic found absent from the CV (EF-CVX-27). Never
 * throws.
 * @param sourceText the text the CV was parsed from
 * @param missingSkills skills the source does not cite; an empty list checks none
 * @req RG-21, EF-CVX-47
 */
export const freeTextCheck = (sourceText: string, missingSkills: readonly string[] = []) => {
  const figures = new Set(figuresIn(sourceText));
  const dates = new Set(datesIn(sourceText));
  const durations = new Set(durationsIn(sourceText));
  return (text: string): boolean => {
    const folded = foldText(text);
    return (
      figuresIn(text).every((figure) => figures.has(figure)) &&
      datesIn(text).every((date) => dates.has(date)) &&
      durationsIn(text).every((duration) => durations.has(duration)) &&
      !missingSkills.some((skill) => cites(folded, skill))
    );
  };
};

/**
 * RG-21: the defensive last look at an assembled CV. Its facts are copied from the source by the code, so every one of
 * them must have its tokens in the source text in order, and its free texts must pass {@link freeTextCheck}.
 * Anything returned is a bug of the assembly, never an answer of the model. Paths only — never the values, which are
 * the candidate's (ENF-SEC-08). An empty array for a faithful CV; never throws.
 * @req RG-21, EF-CVX-26
 */
export const unfaithfulPaths = (cv: AdaptedCv, sourceText: string, missingSkills: readonly string[] = []): FieldPath[] => {
  const sourceKeys = keysOf(sourceText);
  const isFaithful = freeTextCheck(sourceText, missingSkills);
  const paths: FieldPath[] = [];
  const mustBeInSource = (value: string | null, path: FieldPath) => {
    if (value !== null && !isInSource(sourceKeys, value)) paths.push(path);
  };
  const addsNothing = (value: string, path: FieldPath) => {
    if (!isFaithful(value)) paths.push(path);
  };

  addsNothing(cv.headline, ['headline']);
  addsNothing(cv.profile, ['profile']);
  cv.experiences.forEach((experience, index) => {
    const at = ['experiences', index];
    mustBeInSource(experience.title, [...at, 'title']);
    mustBeInSource(experience.organization, [...at, 'organization']);
    mustBeInSource(experience.place, [...at, 'place']);
    mustBeInSource(experience.dates, [...at, 'dates']);
    experience.bullets.forEach((bullet, bulletIndex) => addsNothing(bullet, [...at, 'bullets', bulletIndex]));
  });
  cv.education.forEach((entry, index) => {
    const at = ['education', index];
    mustBeInSource(entry.degree, [...at, 'degree']);
    mustBeInSource(entry.school, [...at, 'school']);
    mustBeInSource(entry.place, [...at, 'place']);
    mustBeInSource(entry.dates, [...at, 'dates']);
    mustBeInSource(entry.detail, [...at, 'detail']);
  });
  for (const key of ['skills', 'certifications', 'languages', 'interests'] as const) {
    cv[key].forEach((item, index) => mustBeInSource(item, [key, index]));
  }
  return paths;
};
