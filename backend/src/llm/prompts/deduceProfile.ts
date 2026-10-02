import { CV_PROMPT_MAX_LENGTH } from './diagnoseCv.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What a deduction reads (EF-VEI-43, EF-VEI-45): the text of a CV type, contact details already set apart (ENF-RGP-07). */
export interface CvToDeduceFrom {
  cvText: string;
}

const SYSTEM = [
  'Tu es un conseiller en recrutement. Tu lis le CV d’un candidat, placé entre balises <cv>, et tu fais deux choses.',
  '1. Liste les périodes d’expérience professionnelle du CV — emplois, alternances, stages —, une par ' +
    'expérience, avec le mois de début (« start ») et le mois de fin (« end ») au format AAAA-MM. Une expérience ' +
    'qui continue a « end » à null. Ne compte pas les études. N’additionne rien, n’écris aucun nombre d’années : ' +
    'le calcul n’est pas ton travail.',
  '2. Propose de 1 à 5 offres types que ce candidat peut chercher. Chacune a un intitulé de poste (« label »), ' +
    'de 1 à 15 mots-clés (« keywords ») qu’on s’attend à lire dans une offre qui lui correspond, les types de ' +
    'contrat qui lui conviennent (« contractTypes », parmi cdi, cdd, alternance, job_etudiant) et le niveau du ' +
    'poste visé (« level » : junior de 0 à 2 ans d’expérience, confirme de 3 à 7 ans, senior à partir de 8 ans).',
  'Appuie-toi uniquement sur ce que le CV dit : ne suppose rien qui n’y soit pas écrit.',
  'Réponds uniquement par un objet JSON de la forme {"periods":[{"start":"2022-09","end":"2024-08"}],' +
    '"targets":[{"label":"…","keywords":["…"],"contractTypes":["cdi"],"level":"junior"}]}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `deduce_profile` task. The CV is framed and declared untrusted (ENF-SEC-06): it may carry text written
 * to sway a model. The number of years is never asked for — the code counts it from the periods (RG-29). Nothing but
 * the text of the CV goes in: no label, no name, no address (ENF-RGP-13).
 * Expected answer: `ProfileDeductionAnswerSchema` (modules/cvTypes).
 * @req EF-VEI-43, EF-VEI-45, ENF-SEC-06, ENF-RGP-13, ENF-COU-01
 */
export const buildDeduceProfilePrompt = ({ cvText }: CvToDeduceFrom): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: frameUntrusted('cv', truncate(cvText, CV_PROMPT_MAX_LENGTH)),
});
