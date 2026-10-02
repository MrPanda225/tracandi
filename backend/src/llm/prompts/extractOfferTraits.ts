import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What an extraction reads (EF-VEI-49): the text of an offer the candidate pasted, without its contact details. */
export interface OfferToExtractFrom {
  offerText: string;
}

// ENF-COU-01: an offer as long as the cap of what the candidate may paste, bounded again for the model.
export const OFFER_TRAITS_TEXT_MAX_LENGTH = 8_000;

const SYSTEM = [
  'Tu lis une offre d’emploi, placée entre balises <offer>, et tu en retiens deux choses :',
  '- "title" : l’intitulé du poste, tel qu’il est écrit, sans le nom de l’entreprise ni le lieu ;',
  '- "keywords" : de 1 à 15 mots-clés — compétences, outils, technologies, domaine — qui permettent de reconnaître ' +
    'une offre du même genre, écrits comme dans l’offre.',
  'N’écris ni nombre d’années ni niveau : le calcul n’est pas ton travail. N’invente rien que l’offre ne dise pas.',
  'Réponds uniquement par un objet JSON de la forme {"title":"Data analyst","keywords":["sql","power bi"]}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `extract_offer_traits` task. The offer is framed and declared untrusted (ENF-SEC-06). Neither the
 * years of experience it demands nor its level are asked for: the code reads them (RG-29, RG-28). The text has no
 * recruiter contact left when it gets here (ENF-RGP-09, ENF-RGP-13).
 * Expected answer: `OfferTraitsAnswerSchema` (modules/chosenOffers).
 * @req EF-VEI-49, ENF-SEC-06, ENF-RGP-13, ENF-COU-01
 */
export const buildExtractOfferTraitsPrompt = ({
  offerText,
}: OfferToExtractFrom): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: frameUntrusted('offer', truncate(offerText, OFFER_TRAITS_TEXT_MAX_LENGTH)),
});
