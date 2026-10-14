import type { AdaptedCv } from './adaptedCv.js';
import { keysOf } from './anchoring.js';
import { figuresIn } from './text.js';

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
 * RG-21: the defensive last look at an assembled CV. Its facts are copied from the source by the code, so every one of
 * them must have its tokens in the source text in order, and its free texts must carry no figure the source does not.
 * Anything returned is a bug of the assembly, never an answer of the model. Paths only — never the values, which are
 * the candidate's (ENF-SEC-08).
 * @req RG-21, EF-CVX-26
 */
export const unfaithfulPaths = (cv: AdaptedCv, sourceText: string): FieldPath[] => {
  const sourceKeys = keysOf(sourceText);
  const sourceFigures = new Set(figuresIn(sourceText));
  const paths: FieldPath[] = [];
  const mustBeInSource = (value: string | null, path: FieldPath) => {
    if (value !== null && !isInSource(sourceKeys, value)) paths.push(path);
  };
  const addsNoFigure = (value: string, path: FieldPath) => {
    if (figuresIn(value).some((figure) => !sourceFigures.has(figure))) paths.push(path);
  };

  addsNoFigure(cv.headline, ['headline']);
  addsNoFigure(cv.profile, ['profile']);
  cv.experiences.forEach((experience, index) => {
    const at = ['experiences', index];
    mustBeInSource(experience.title, [...at, 'title']);
    mustBeInSource(experience.organization, [...at, 'organization']);
    mustBeInSource(experience.place, [...at, 'place']);
    mustBeInSource(experience.dates, [...at, 'dates']);
    experience.bullets.forEach((bullet, bulletIndex) => addsNoFigure(bullet, [...at, 'bullets', bulletIndex]));
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
