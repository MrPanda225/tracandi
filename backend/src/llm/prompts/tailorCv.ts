import { CV_PROMPT_MAX_LENGTH, OFFER_PROMPT_MAX_LENGTH } from './diagnoseCv.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What an adapted CV is written from (EF-CVX-25): the CV without contact details, the offer, and its diagnostic. */
export interface CvToTailor {
  cvText: string;
  offerText: string;
  diagnosis: { explanations: readonly string[]; missingSkills: readonly string[] };
}

const DIAGNOSIS_MAX_LENGTH = 2_000;

const SYSTEM = [
  'Tu es un recruteur expérimenté. Tu adaptes le CV d’un candidat à une offre d’emploi, pour qu’il passe le tri des ' +
    'logiciels de recrutement et donne envie d’être lu.',
  'Le CV est entre balises <cv>, l’offre entre balises <offer>, le diagnostic du CV face à l’offre entre balises ' +
    '<diagnosis>.',
  'Règles absolues :',
  '- Recopie à l’identique les noms d’entreprises et d’établissements, les intitulés de poste, les diplômes, les lieux ' +
    'et les dates, tels qu’ils sont écrits dans le CV : l’intitulé d’un poste ne se réécrit jamais, même pour ' +
    'l’offre.',
  '- Écris chaque compétence, outil, certification, langue et centre d’intérêt avec les mots du CV, sans les ' +
    'traduire ni les renommer, un seul par élément de liste.',
  '- N’ajoute aucune expérience, aucun diplôme, aucune certification, aucun chiffre, aucune compétence, aucun outil, ' +
    'aucune langue et aucun centre d’intérêt absents du CV. Une compétence que l’offre demande et que le CV ne cite ' +
    'pas reste absente.',
  'Tu peux : reformuler une réalisation avec le vocabulaire de l’offre quand le CV décrit bien la même chose, ' +
    'réordonner, choisir les réalisations les plus utiles pour ce poste, raccourcir, réécrire l’accroche ' +
    '(headline, le titre en tête du CV) et le profil.',
  'Écris en français, avec des phrases courtes qui commencent par un verbe d’action. Garde chaque expérience et chaque ' +
    'formation du CV, dans l’ordre du plus récent au plus ancien.',
  'Dans changes, liste chaque modification : section (le titre de la rubrique), before (le texte du CV), after (le ' +
    'nouveau texte) et reason (une phrase qui dit pourquoi ce changement sert cette offre). 30 au plus.',
  'Réponds uniquement par un objet JSON de la forme {"cv":{"headline":"…","profile":"…","experiences":[{"title":"…",' +
    '"organization":"…","place":null,"dates":"…","bullets":["…"]}],"education":[{"degree":"…","school":"…",' +
    '"place":null,"dates":"…","detail":null}],"skills":["…"],"certifications":[],"languages":[],"interests":[]},' +
    '"changes":[{"section":"…","before":"…","after":"…","reason":"…"}]}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `tailor_cv` task. The CV, the offer and the diagnostic (itself written by a model) are framed and
 * declared untrusted (ENF-SEC-06). Faithfulness is asked for here and checked by the code (RG-21): the answer must
 * meet `tailoredAnswerSchemaFor` (modules/cvWorkshop).
 * @req EF-CVX-25, EF-CVX-29, RG-21, ENF-SEC-06, ENF-COU-01
 */
export const buildTailorCvPrompt = ({ cvText, offerText, diagnosis }: CvToTailor): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: [
    frameUntrusted('cv', truncate(cvText, CV_PROMPT_MAX_LENGTH)),
    frameUntrusted('offer', truncate(offerText, OFFER_PROMPT_MAX_LENGTH)),
    frameUntrusted(
      'diagnosis',
      truncate(
        [
          ...diagnosis.explanations,
          `Compétences absentes du CV, à ne pas ajouter : ${diagnosis.missingSkills.join(', ') || 'aucune'}`,
        ].join('\n'),
        DIAGNOSIS_MAX_LENGTH,
      ),
    ),
  ].join('\n\n'),
});
