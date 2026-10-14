import type { AdaptedCv } from './adaptedCv.js';
import type { AnchoredItem, ParsedCv } from './anchoring.js';
import { ATS_SECTION_TITLES } from './onePage.js';
import { figuresIn, sentencesOf } from './text.js';
import { MAX_CHANGES, type TailorCvAnswer } from './tailorCvAnswer.js';

/** EF-CVX-29: one change of the adapted CV — where, what it was, what it became, and why for this offer. */
export interface CvChange {
  section: string;
  before: string;
  after: string;
  reason: string;
}

const HEADLINE_SECTION = 'Titre du CV';
const DETAIL_SEPARATOR = ' ; ';
const BULLET_SEPARATOR = ' · ';

/** Whether a free text of the model carries only figures of the imported CV (RG-21). */
const addsNoFigure = (figures: ReadonlySet<string>) => (text: string) =>
  figuresIn(text).every((figure) => figures.has(figure));

/** The items the model chose, in the order of the CV; all of them when it chose none that exists. */
const chosenOrAll = (items: readonly AnchoredItem[], ids: readonly string[]): string[] => {
  const wanted = new Set(ids);
  const chosen = items.filter((item) => wanted.has(item.id));
  return (chosen.length > 0 ? chosen : items).map((item) => item.text);
};

/** The first choice made for each id; an id the CV does not have is never looked up. */
const firstById = <T extends { id: string }>(choices: readonly T[]): Map<string, T> => {
  const byId = new Map<string, T>();
  for (const choice of choices) if (!byId.has(choice.id)) byId.set(choice.id, choice);
  return byId;
};

/**
 * RG-21, RG-24, EF-CVX-47: the adapted CV, written by the code. Every fact (titles, companies, places, dates, degrees,
 * schools, list items) is copied from the parsed CV; the model only supplies rewritten bullets, a headline, a profile
 * and the ids it keeps. Every experience and education entry stays, with its facts, even when the model gave it no
 * bullet. A free text citing a figure the CV does not carry is removed (a bullet, a sentence of the profile) or
 * replaced by the CV's own (the headline).
 * @param sourceText the text the CV was parsed from, where the figures are looked for
 * @req RG-21, RG-24, EF-CVX-47
 */
export const assembleCv = ({
  parsed,
  answer,
  sourceText,
}: {
  parsed: ParsedCv;
  answer: TailorCvAnswer;
  sourceText: string;
}): AdaptedCv => {
  const isFaithful = addsNoFigure(new Set(figuresIn(sourceText)));
  const experienceChoices = firstById(answer.experiences);
  const educationChoices = firstById(answer.education);
  const headline =
    answer.headline !== null && isFaithful(answer.headline)
      ? answer.headline
      : (parsed.headline ?? parsed.experiences[0]?.title ?? parsed.education[0]?.degree ?? '');
  const profile = answer.profile === null ? (parsed.profile ?? '') : sentencesOf(answer.profile).filter(isFaithful).join(' ');

  return {
    headline,
    profile,
    experiences: parsed.experiences.map((experience) => ({
      title: experience.title,
      organization: experience.organization,
      place: experience.place,
      dates: experience.dates,
      bullets: (experienceChoices.get(experience.id)?.bullets ?? []).filter(isFaithful),
    })),
    education: parsed.education.map((entry) => {
      const wanted = new Set(educationChoices.get(entry.id)?.details ?? []);
      const details = entry.details.filter((detail) => wanted.has(detail.id)).map((detail) => detail.text);
      return {
        degree: entry.degree,
        school: entry.school,
        place: entry.place,
        dates: entry.dates,
        detail: details.length > 0 ? details.join(DETAIL_SEPARATOR) : null,
      };
    }),
    skills: chosenOrAll(parsed.skills, answer.skills),
    certifications: chosenOrAll(parsed.certifications, answer.certifications),
    languages: chosenOrAll(parsed.languages, answer.languages),
    interests: chosenOrAll(parsed.interests, answer.interests),
  };
};

/** What a target of a change was and became, or null when the target does not exist (any more). */
const textsOf = (target: string, parsed: ParsedCv, cv: AdaptedCv): Pick<CvChange, 'section' | 'before' | 'after'> | null => {
  if (target === 'headline') return { section: HEADLINE_SECTION, before: parsed.headline ?? '', after: cv.headline };
  if (target === 'profile') {
    return { section: ATS_SECTION_TITLES.profile, before: parsed.profile ?? '', after: cv.profile };
  }
  const index = parsed.experiences.findIndex((experience) => experience.id === target);
  const experience = parsed.experiences[index];
  const adapted = cv.experiences[index];
  if (!experience || !adapted) return null;
  return {
    section: ATS_SECTION_TITLES.experiences,
    before: experience.bullets.map((bullet) => bullet.text).join(BULLET_SEPARATOR),
    after: adapted.bullets.join(BULLET_SEPARATOR),
  };
};

/**
 * EF-CVX-29: the changes shown to the candidate, built by the code from what the model named (the target and the
 * reason) — `before` is the CV's own text, `after` what the final CV says (once the page was fitted). A change whose
 * text did not change, or whose target no longer exists, is dropped.
 * @req EF-CVX-29, RG-21
 */
export const buildChanges = ({
  parsed,
  answer,
  cv,
}: {
  parsed: ParsedCv;
  answer: TailorCvAnswer;
  cv: AdaptedCv;
}): CvChange[] => {
  const seen = new Set<string>();
  return answer.changes
    .flatMap(({ target, reason }): CvChange[] => {
      if (seen.has(target)) return [];
      seen.add(target);
      const texts = textsOf(target, parsed, cv);
      if (!texts || texts.after === '' || texts.after === texts.before) return [];
      return [{ ...texts, reason }];
    })
    .slice(0, MAX_CHANGES);
};
