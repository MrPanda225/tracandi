import type { AdaptedCv } from './adaptedCv.js';
import type { AnchoredItem, ParsedCv } from './anchoring.js';
import { freeTextCheck } from './fidelity.js';
import { ATS_SECTION_TITLES } from './onePage.js';
import { sentencesOf } from './text.js';
import type { TailorCvAnswer } from './tailorCvAnswer.js';

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
const LIST_SEPARATOR = ', ';
/** EF-CVX-29: what a change shows « after » when nothing is left of its text. */
const REMOVED = '(retiré)';

/**
 * The items the model chose, in the order it gave them (the most useful for the offer first), each once; an id the CV
 * does not have is ignored; all the items, in the order of the CV, when it chose none that exists.
 */
const chosenOrAll = (items: readonly AnchoredItem[], ids: readonly string[]): string[] => {
  const byId = new Map(items.map((item) => [item.id, item.text]));
  const chosen = [...new Set(ids)].flatMap((id) => {
    const text = byId.get(id);
    return text === undefined ? [] : [text];
  });
  return chosen.length > 0 ? chosen : items.map((item) => item.text);
};

/** RG-21: the CV's own headline, else its first job title, else its first degree. */
const headlineOfCv = (parsed: ParsedCv): string =>
  parsed.headline ?? parsed.experiences[0]?.title ?? parsed.education[0]?.degree ?? '';

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
 * bullet. A free text that fails {@link freeTextCheck} — a figure, a date or a duration the CV does not carry, or a skill
 * the diagnostic found absent from it — is removed (a bullet, a sentence of the profile) or replaced by the CV's own
 * (the headline). The lists keep the order the model gave. Never throws.
 * @param sourceText the text the CV was parsed from, where the figures, dates and durations are looked for
 * @param missingSkills the skills of the offer the CV does not cite (EF-CVX-27); none are looked for when left out
 * @req RG-21, RG-24, EF-CVX-47
 */
export const assembleCv = ({
  parsed,
  answer,
  sourceText,
  missingSkills = [],
}: {
  parsed: ParsedCv;
  answer: TailorCvAnswer;
  sourceText: string;
  missingSkills?: readonly string[];
}): AdaptedCv => {
  const isFaithful = freeTextCheck(sourceText, missingSkills);
  const experienceChoices = firstById(answer.experiences);
  const educationChoices = firstById(answer.education);
  const headline =
    answer.headline !== null && isFaithful(answer.headline) ? answer.headline : headlineOfCv(parsed);
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

type ChangeTexts = Pick<CvChange, 'section' | 'before' | 'after'>;
type ListKey = 'skills' | 'certifications' | 'languages' | 'interests';
const LIST_KEYS: readonly ListKey[] = ['skills', 'certifications', 'languages', 'interests'];

/** EF-CVX-29: the reasons the code gives to a change the model did not explain. */
const CODE_REASONS = {
  headline: 'Titre adapté à l’offre.',
  profile: 'Profil adapté à l’offre.',
  profileTrimmed: 'Profil raccourci pour tenir sur une page.',
  experience: 'Réalisations choisies et reformulées pour l’offre.',
  experienceTrimmed: 'Réalisations retirées pour tenir sur une page.',
  education: 'Détails choisis pour l’offre.',
  educationTrimmed: 'Détails retirés pour tenir sur une page.',
  listDropped: 'Éléments écartés, moins utiles pour cette offre.',
  listReordered: 'Éléments réordonnés, les plus utiles pour l’offre d’abord.',
} as const;

/** One target a change may name, with what it was in the CV, what the final CV says, and why when the model is silent. */
interface Target {
  id: string;
  texts: ChangeTexts;
  /** The reason of the code, used alone when the model gave none. */
  codeReason: string;
  /** Said after the model's reason too: the page fitting trimmed this target further. */
  trimmedReason: string | null;
}

/**
 * Every part of the CV a change may name — headline, profile, each experience and education entry, each list — in the
 * order of the CV, with its texts before and after and the reason the code gives it.
 */
const targetsOf = (parsed: ParsedCv, assembled: AdaptedCv, cv: AdaptedCv): Target[] => {
  const trimmed = (wasTrimmed: boolean, reason: string): string | null => (wasTrimmed ? reason : null);
  const profileTrimmed = trimmed(cv.profile !== assembled.profile, CODE_REASONS.profileTrimmed);
  const targets: Target[] = [
    {
      id: 'headline',
      texts: { section: HEADLINE_SECTION, before: parsed.headline ?? '', after: cv.headline },
      codeReason: CODE_REASONS.headline,
      trimmedReason: null,
    },
    {
      id: 'profile',
      texts: { section: ATS_SECTION_TITLES.profile, before: parsed.profile ?? '', after: cv.profile },
      codeReason: profileTrimmed ?? CODE_REASONS.profile,
      trimmedReason: profileTrimmed,
    },
  ];
  parsed.experiences.forEach((experience, index) => {
    const after = cv.experiences[index]?.bullets ?? [];
    const pageTrimmed = trimmed(
      after.length < (assembled.experiences[index]?.bullets.length ?? 0),
      CODE_REASONS.experienceTrimmed,
    );
    targets.push({
      id: experience.id,
      texts: {
        section: ATS_SECTION_TITLES.experiences,
        before: experience.bullets.map((bullet) => bullet.text).join(BULLET_SEPARATOR),
        after: after.join(BULLET_SEPARATOR),
      },
      codeReason: pageTrimmed ?? CODE_REASONS.experience,
      trimmedReason: pageTrimmed,
    });
  });
  parsed.education.forEach((entry, index) => {
    const after = cv.education[index]?.detail ?? null;
    const pageTrimmed = trimmed(after === null && (assembled.education[index]?.detail ?? null) !== null, CODE_REASONS.educationTrimmed);
    targets.push({
      id: entry.id,
      texts: {
        section: ATS_SECTION_TITLES.education,
        before: entry.details.map((detail) => detail.text).join(DETAIL_SEPARATOR),
        after: after ?? '',
      },
      codeReason: pageTrimmed ?? CODE_REASONS.education,
      trimmedReason: pageTrimmed,
    });
  });
  for (const key of LIST_KEYS) {
    const before = parsed[key].map((item) => item.text);
    const kept = new Set(cv[key]);
    targets.push({
      id: key,
      texts: { section: ATS_SECTION_TITLES[key], before: before.join(LIST_SEPARATOR), after: cv[key].join(LIST_SEPARATOR) },
      codeReason: before.every((item) => kept.has(item)) ? CODE_REASONS.listReordered : CODE_REASONS.listDropped,
      trimmedReason: null,
    });
  }
  return targets;
};

/**
 * EF-CVX-29: every change shown to the candidate — one per part of the CV whose text differs from the imported CV's:
 * the headline, the profile, each experience (its bullets), each education entry (its details), each list. `before`
 * is the CV's own text, `after` what the final CV says once the page was fitted (« (retiré) » when nothing is left).
 * The reason is the model's when it named the part, followed by the code's when the page fitting trimmed it further;
 * the code's own otherwise (« Réalisations retirées pour tenir sur une page. »…). The parts the model named come
 * first, in its order, then the others in the order of the CV; each part once. A target the CV does not have, or
 * whose text did not change, gives no change. Never throws; an empty array when nothing changed.
 * @param assembled the CV before the page was fitted (RG-24), to tell what the fitting removed
 * @req EF-CVX-29, RG-21, RG-24
 */
export const buildChanges = ({
  parsed,
  answer,
  assembled,
  cv,
}: {
  parsed: ParsedCv;
  answer: TailorCvAnswer;
  assembled: AdaptedCv;
  cv: AdaptedCv;
}): CvChange[] => {
  const targets = targetsOf(parsed, assembled, cv);
  const reasons = new Map<string, string>();
  for (const { target, reason } of answer.changes) if (!reasons.has(target)) reasons.set(target, reason);
  const named = [...reasons.keys()].flatMap((id) => targets.filter((target) => target.id === id));
  const ordered = [...named, ...targets.filter((target) => !reasons.has(target.id))];
  return ordered.flatMap(({ id, texts, codeReason, trimmedReason }): CvChange[] => {
    if (texts.after === texts.before) return [];
    const modelReason = reasons.get(id);
    const reason =
      modelReason === undefined ? codeReason : [modelReason, trimmedReason].filter((part) => part !== null).join(' ');
    return [{ ...texts, after: texts.after === '' ? REMOVED : texts.after, reason }];
  });
};
