import type { ScorableOffer, ScoringTarget } from '../../modules/offers/scoring.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** ENF-COU-01: bounds of what one batch sends, whatever the size of an offer. */
export const OFFER_TITLE_MAX_LENGTH = 300;
export const OFFER_DESCRIPTION_MAX_LENGTH = 2000;
const LOCATION_MAX_LENGTH = 200;

/** What the candidate looks for, as the scoring states it. Comes from the reference profile (EF-CVX-02). */
export interface ScoringProfile {
  /** RG-09: where the candidate can work, in their own words. */
  searchArea: string;
  targets: readonly ScoringTarget[];
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

const SYSTEM = [
  'Tu notes des offres d’emploi pour un candidat, de 0 à 100, selon leur pertinence pour lui.',
  'Le profil du candidat est placé entre balises <candidate_profile>, chaque offre entre balises <offer ref="N">.',
  'Critères, tous d’égale importance (RG-09) :',
  '- l’offre correspond à l’une des cibles du candidat ;',
  '- le lieu est dans sa zone de recherche, ou le télétravail est possible ;',
  '- le type de contrat de l’offre est accepté par la cible ; un contrat non précisé ne pénalise pas l’offre ;',
  '- l’expérience exigée ne dépasse pas trois ans.',
  'Chaque critère non satisfait abaisse le score. Une offre qui ne satisfait aucun critère est proche de 0 ; ' +
    'une offre qui les satisfait tous est proche de 100.',
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
  ].join('\n');

const describeOffer = (offer: OfferToScore): string =>
  frameUntrusted(
    'offer',
    [
      `Intitulé : ${truncate(offer.title, OFFER_TITLE_MAX_LENGTH)}`,
      `Lieu : ${offer.location ? truncate(offer.location, LOCATION_MAX_LENGTH) : '(non précisé)'}`,
      `Contrat : ${CONTRACT_WORDINGS[offer.contractType] ?? 'non précisé'}`,
      `Description : ${offer.description ? truncate(offer.description, OFFER_DESCRIPTION_MAX_LENGTH) : '(aucune)'}`,
    ].join('\n'),
    { ref: offer.ref },
  );

/**
 * Prompt of the `score_offers` task for one batch of offers, referenced 1, 2… in their order. The profile is the
 * candidate's own data and is framed all the same, because an offer read just before could otherwise pretend to
 * be part of it (ENF-SEC-06). Expected answer: `ScoredOffersSchema` (modules/offers).
 * @req EF-VEI-12, EF-VEI-13, RG-09, ENF-SEC-06, ENF-COU-01
 */
export const buildScoreOffersPrompt = (
  profile: ScoringProfile,
  offers: readonly OfferToScore[],
): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: [
    frameUntrusted('candidate_profile', describeProfile(profile)),
    ...offers.map((offer) => describeOffer(offer)),
  ].join('\n\n'),
});
