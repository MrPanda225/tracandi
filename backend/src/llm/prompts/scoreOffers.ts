import type { Level } from '../../modules/criteria/experience.js';
import type { ScorableOffer, ScoringTarget } from '../../modules/offers/scoring.js';
import { HOSTED_BATCH_LIMITS } from '../limits.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** ENF-COU-01: bounds of what one batch sends, whatever the size of an offer. */
export const OFFER_TITLE_MAX_LENGTH = 300;
export const OFFER_DESCRIPTION_MAX_LENGTH = HOSTED_BATCH_LIMITS.descriptionChars;
const LOCATION_MAX_LENGTH = 200;

/** What the candidate looks for, as the scoring states it. Comes from the reference profile (EF-CVX-02). */
export interface ScoringProfile {
  /** RG-09: where the candidate can work, in their own words. */
  searchArea: string;
  targets: readonly ScoringTarget[];
  /** EF-VEI-50, RG-09 (v1.35): the level the experience demanded is compared with; absent, three years at most. */
  level?: Level;
  /** EF-VEI-50: the traits of the offers the candidate chose for their level, as models of what suits them. */
  chosenOffers?: readonly ChosenOfferTraits[];
}

/** What is kept of a chosen offer and carried into the scoring: its title and keywords (ENF-RGP-14). */
export interface ChosenOfferTraits {
  title: string;
  keywords: readonly string[];
}

/** One offer of a batch, referenced 1, 2… in the order of the prompt. */
export interface OfferToScore extends ScorableOffer {
  ref: number;
  location: string | null;
}

/** Contract wordings the candidate accepts, as the prompt states them (RG-09). */
const CONTRACT_WORDINGS: Readonly<Record<string, string>> = {
  cdi: 'CDI',
  cdd: 'CDD',
  alternance: 'alternance',
  job_etudiant: 'job étudiant',
};

/** RG-28: how the instruction names each level and the experience it stands for. */
const LEVEL_WORDINGS: Readonly<Record<Level, { name: string; range: string }>> = {
  junior: { name: 'junior', range: 'de 0 à 2 ans' },
  confirme: { name: 'confirmé', range: 'de 3 à 7 ans' },
  senior: { name: 'senior', range: '8 ans ou plus' },
};

/** RG-09: the criterion of experience — against the level of the candidate when he has one, three years otherwise. */
const experienceCriterionOf = (level: Level | undefined): string => {
  if (level === undefined) return '- l’expérience exigée ne dépasse pas trois ans.';
  const { name, range } = LEVEL_WORDINGS[level];
  return (
    `- l’expérience exigée est compatible avec le niveau du candidat (${name}, soit ${range} d’expérience) : ` +
    'une offre qui exige autant ou moins ne pénalise pas, une offre qui exige davantage abaisse le score.'
  );
};

/** EF-VEI-50: how the chosen offers are to be read — as models, never as a text to match word for word. */
const CHOSEN_OFFERS_INSTRUCTION =
  'Les offres choisies du candidat sont des modèles de ce qui lui convient : une offre qui leur ressemble par le ' +
  'poste et les mots-clés est plus pertinente. Elles ne remplacent pas les critères ci-dessus.';

const systemInstructionOf = (level: Level | undefined, hasChosenOffers: boolean): string =>
  [
    'Tu notes des offres d’emploi pour un candidat, de 0 à 100, selon leur pertinence pour lui.',
    'Le profil du candidat est placé entre balises <candidate_profile>, chaque offre entre balises <offer ref="N">.',
    'Critères, tous d’égale importance (RG-09) :',
    '- l’offre correspond à l’une des cibles du candidat ;',
    '- le lieu est dans sa zone de recherche, ou le télétravail est possible ;',
    '- le type de contrat de l’offre est accepté par la cible ; un contrat non précisé ne pénalise pas l’offre ;',
    experienceCriterionOf(level),
    'Chaque critère non satisfait abaisse le score. Une offre qui ne satisfait aucun critère est proche de 0 ; ' +
      'une offre qui les satisfait tous est proche de 100.',
    ...(hasChosenOffers ? [CHOSEN_OFFERS_INSTRUCTION] : []),
    'Donne aussi "reason" : une seule phrase en français disant ce qui justifie ce score, sans recopier l’offre.',
    'Réponds uniquement par un objet JSON de la forme ' +
      '{"offers":[{"ref":1,"score":78,"reason":"Poste de data analyst en CDI à Paris, dans votre zone de recherche."}]}, ' +
      'avec un élément par offre, dans l’ordre des références.',
    UNTRUSTED_CONTENT_NOTICE,
  ].join('\n');

const describeProfile = (profile: ScoringProfile): string =>
  [
    `Zone de recherche : ${profile.searchArea}`,
    'Cibles :',
    ...profile.targets.map((target) => {
      const contracts = target.contractTypes
        .map((contract) => CONTRACT_WORDINGS[contract] ?? contract)
        .join(', ');
      return `- ${target.label} (contrats acceptés : ${contracts}) — mots-clés : ${target.keywords.join(', ')}`;
    }),
    ...(profile.chosenOffers?.length
      ? [
          'Offres que le candidat a choisies pour son niveau :',
          ...profile.chosenOffers.map(
            (chosen) => `- ${chosen.title} — mots-clés : ${chosen.keywords.join(', ')}`,
          ),
        ]
      : []),
  ].join('\n');

const describeOffer = (offer: OfferToScore, descriptionChars: number): string =>
  frameUntrusted(
    'offer',
    [
      `Intitulé : ${truncate(offer.title, OFFER_TITLE_MAX_LENGTH)}`,
      `Lieu : ${offer.location ? truncate(offer.location, LOCATION_MAX_LENGTH) : '(non précisé)'}`,
      `Contrat : ${CONTRACT_WORDINGS[offer.contractType] ?? 'non précisé'}`,
      `Description : ${offer.description ? truncate(offer.description, descriptionChars) : '(aucune)'}`,
    ].join('\n'),
    { ref: offer.ref },
  );

/**
 * Prompt of the `score_offers` task for one batch of offers, referenced 1, 2… in their order. The profile is the
 * candidate's own data and is framed all the same, because an offer read just before could otherwise pretend to
 * be part of it (ENF-SEC-06). Expected answer: `ScoredOffersSchema` (modules/offers).
 * @req EF-VEI-12, EF-VEI-13, RG-09, ENF-SEC-06, ENF-COU-01, EF-IA-12
 */
export const buildScoreOffersPrompt = (
  profile: ScoringProfile,
  offers: readonly OfferToScore[],
  { descriptionChars = OFFER_DESCRIPTION_MAX_LENGTH }: { descriptionChars?: number } = {},
): { system: string; prompt: string } => ({
  system: systemInstructionOf(profile.level, (profile.chosenOffers?.length ?? 0) > 0),
  prompt: [
    frameUntrusted('candidate_profile', describeProfile(profile)),
    ...offers.map((offer) => describeOffer(offer, descriptionChars)),
  ].join('\n\n'),
});
