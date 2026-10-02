import type { CriteriaContractType, ExperienceLevel, ProfileValidation } from '../../../api/criteria';
import type { ProfileDeduction } from '../../../api/cvTypes';
import { levelOfYears, parseYears } from '../../../lib/experience';
import { describeKeywordsProblem, describeLabelProblem, keywordsOf } from './fields';

/** EF-VEI-45, EF-VEI-46: the candidate keeps five offers at most, whatever the CV types proposed. */
export const MAX_OFFER_TYPES = 5;

/** What was deduced from one CV type, with the CV it comes from. */
export interface DeductionOfCv {
  cvId: number;
  cvLabel: string;
  deduction: ProfileDeduction;
}

/** An offer proposed by a CV type, as the candidate edits it; the keywords stay the text typed until validation. */
export interface OfferDraft {
  /** Identifies the offer in the list while it is edited; never sent. */
  key: string;
  /** The CV type that proposed it. */
  source: string;
  label: string;
  keywords: string;
  contractTypes: CriteriaContractType[];
  isKept: boolean;
}

/**
 * The profile as the candidate corrects it before validating. `manualLevel` is a level picked by hand; without it the
 * level follows the years (RG-28).
 */
export interface ProfileDraft {
  years: string;
  manualLevel: ExperienceLevel | null;
  offers: OfferDraft[];
}

/**
 * EF-VEI-45, EF-VEI-47: the draft to correct, from what every CV type deduced. The years start at the most the CVs
 * count — each counts only its own periods, and the candidate corrects — and the first five offers are kept.
 */
export const draftOf = (deductions: readonly DeductionOfCv[]): ProfileDraft => ({
  years:
    deductions.length === 0 ? '' : String(Math.max(...deductions.map(({ deduction }) => deduction.years))),
  manualLevel: null,
  offers: deductions
    .flatMap(({ cvId, cvLabel, deduction }) =>
      deduction.targets.map((target, index) => ({
        key: `${String(cvId)}-${String(index)}`,
        source: cvLabel,
        label: target.label,
        keywords: target.keywords.join(', '),
        contractTypes: target.contractTypes,
      })),
    )
    .map((offer, index) => ({ ...offer, isKept: index < MAX_OFFER_TYPES })),
});

/** The years typed, when they are a valid number. */
const yearsOf = (draft: ProfileDraft): number | null => {
  const reading = parseYears(draft.years);
  return 'years' in reading ? reading.years : null;
};

/**
 * EF-VEI-47, RG-28: the level shown — the one the candidate picked, else the one the years give, live as they are
 * typed; none while the years are empty or refused.
 */
export const levelOf = (draft: ProfileDraft): ExperienceLevel | null => {
  if (draft.manualLevel !== null) return draft.manualLevel;
  const years = yearsOf(draft);
  return years === null ? null : levelOfYears(years);
};

/** EF-VEI-47: a level picked that the years typed do not give — the one thing to tell the candidate about. */
export const doesLevelOverrideYears = (draft: ProfileDraft): boolean => {
  const years = yearsOf(draft);
  return draft.manualLevel !== null && years !== null && draft.manualLevel !== levelOfYears(years);
};

export interface OfferProblems {
  label: string | null;
  keywords: string | null;
  contracts: string | null;
}

export interface ProfileProblems {
  years: string | null;
  /** Neither years nor level: the profile says nothing of the candidate's experience. */
  level: string | null;
  /** About how many offers are kept. */
  offers: string | null;
  /** The offers kept that the API would refuse, by their key. */
  perOffer: ReadonlyMap<string, OfferProblems>;
}

const problemsOfOffer = (offer: OfferDraft): OfferProblems | null => {
  const problems: OfferProblems = {
    label: describeLabelProblem(offer.label),
    keywords: describeKeywordsProblem(keywordsOf(offer.keywords)),
    contracts: offer.contractTypes.length === 0 ? 'Choisissez au moins un contrat.' : null,
  };
  return Object.values(problems).some((problem) => problem !== null) ? problems : null;
};

/**
 * EF-VEI-45 to EF-VEI-47: everything the API would refuse in the draft, in the words it uses, so that the candidate
 * hears it before sending.
 */
export const profileProblems = (draft: ProfileDraft): ProfileProblems => {
  const kept = draft.offers.filter((offer) => offer.isKept);
  const reading = parseYears(draft.years);
  const perOffer = new Map<string, OfferProblems>();
  for (const offer of kept) {
    const problems = problemsOfOffer(offer);
    if (problems) perOffer.set(offer.key, problems);
  }
  let offers: string | null = null;
  if (kept.length === 0) offers = 'Gardez au moins une offre type.';
  else if (kept.length > MAX_OFFER_TYPES) offers = 'Gardez 5 offres types au plus.';
  return {
    years: 'problem' in reading ? reading.problem : null,
    level:
      'problem' in reading || levelOf(draft) !== null
        ? null
        : 'Indiquez vos années d’expérience, ou choisissez un niveau.',
    offers,
    perOffer,
  };
};

/** True when the draft has nothing the API would refuse. */
export const hasNoProblem = ({ years, level, offers, perOffer }: ProfileProblems): boolean =>
  years === null && level === null && offers === null && perOffer.size === 0;

/**
 * EF-VEI-46, EF-VEI-47: what is sent to validate. The years alone when the level follows them; the level alone when
 * the candidate picked one the years do not give — the API lets the years win over a level sent beside them.
 * Only valid after `profileProblems` found nothing.
 */
export const profileBodyOf = (draft: ProfileDraft): ProfileValidation => {
  const targets = draft.offers
    .filter((offer) => offer.isKept)
    .map((offer) => ({
      label: offer.label.trim(),
      keywords: keywordsOf(offer.keywords),
      contractTypes: offer.contractTypes,
    }));
  const years = yearsOf(draft);
  if (years !== null && !doesLevelOverrideYears(draft)) return { targets, years };
  return draft.manualLevel === null ? { targets } : { targets, level: draft.manualLevel };
};
