import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What a diagnostic compares (EF-CVX-24): the text of the CV without contact details, and the offer. */
export interface CvToDiagnose {
  cvText: string;
  offerText: string;
}

// ENF-COU-01: bounded input — a CV of three dense pages, an offer as long as they come.
export const CV_PROMPT_MAX_LENGTH = 12_000;
export const OFFER_PROMPT_MAX_LENGTH = 8_000;

const SYSTEM = [
  'Tu es un recruteur expérimenté et bienveillant. Tu compares le CV d’un candidat à une offre d’emploi.',
  'Le CV est placé entre balises <cv>, l’offre entre balises <offer>.',
  'Évalue quatre dimensions, chacune par un entier de 0 à 100 :',
  '- skills : les compétences demandées par l’offre que le CV démontre ;',
  '- experience : la nature, la durée et le niveau des expériences au regard du poste ;',
  '- education : le diplôme et la formation au regard de ce que l’offre attend ;',
  '- techStack : les outils, langages et technologies de l’offre présents dans le CV.',
  'Pour chacune, écris une explication de 1 à 3 phrases courtes, adressée au candidat en le vouvoyant : naturelle, ' +
    'chaleureuse et concrète. Cite ce qui colle et ce qui manque, avec les mots du CV et de l’offre. Pas de jargon, ' +
    'pas de note répétée, pas de formule toute faite.',
  'Dans missingSkills, liste les compétences et outils explicitement demandés par l’offre et absents du CV, écrits ' +
    'comme dans l’offre : 20 au plus, 60 caractères chacun.',
  'Ne suppose rien que le CV ne dise pas : une compétence qui n’y est pas écrite est absente.',
  'Réponds uniquement par un objet JSON de la forme {"skills":{"score":0,"explanation":"…"},' +
    '"experience":{"score":0,"explanation":"…"},"education":{"score":0,"explanation":"…"},' +
    '"techStack":{"score":0,"explanation":"…"},"missingSkills":["…"]}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `diagnose_cv` task. The CV and the offer are framed and declared untrusted (ENF-SEC-06): either may
 * carry text written to sway a model. The overall score is never asked for — the code computes it (RG-23).
 * Expected answer: `DiagnosisAnswerSchema` (modules/cvWorkshop).
 * @req EF-CVX-24, EF-CVX-27, ENF-SEC-06, ENF-COU-01
 */
export const buildDiagnoseCvPrompt = ({
  cvText,
  offerText,
}: CvToDiagnose): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: [
    frameUntrusted('cv', truncate(cvText, CV_PROMPT_MAX_LENGTH)),
    frameUntrusted('offer', truncate(offerText, OFFER_PROMPT_MAX_LENGTH)),
  ].join('\n\n'),
});
