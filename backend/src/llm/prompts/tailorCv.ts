import type { ParsedCv } from '../../modules/cvWorkshop/anchoring.js';
import { CV_PROMPT_MAX_LENGTH, OFFER_PROMPT_MAX_LENGTH } from './diagnoseCv.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** What an adapted CV is written from (EF-CVX-25): the parsed CV, the offer, and its diagnostic. */
export interface CvToTailor {
  /** The CV as parsed (contact details already taken out): the facts, each with the id the model points to. */
  cv: ParsedCv;
  offerText: string;
  diagnosis: { explanations: readonly string[]; missingSkills: readonly string[] };
}

const DIAGNOSIS_MAX_LENGTH = 2_000;

const SYSTEM = [
  'Tu es un recruteur expérimenté. Tu adaptes le CV d’un candidat à une offre d’emploi, pour qu’il passe le tri des ' +
    'logiciels de recrutement et donne envie d’être lu.',
  'Le CV est entre balises <cv>, déjà découpé : chaque élément a un identifiant (exp_0, exp_0.b0, edu_0, edu_0.d0, ' +
    'skill_3, cert_0, lang_0, int_0). L’offre est entre balises <offer>, le diagnostic du CV face à l’offre entre ' +
    'balises <diagnosis>.',
  'Tu n’écris jamais un intitulé de poste, un nom d’entreprise ou d’établissement, un lieu, une date, un diplôme ni ' +
    'un élément de liste : tu désignes ceux du CV par leur identifiant, le code les recopie.',
  'Tu écris seulement : l’accroche (headline, le titre en tête du CV), le profil, et les réalisations de chaque ' +
    'expérience.',
  'Règles absolues :',
  '- Reformule une réalisation avec le vocabulaire de l’offre seulement quand le CV décrit bien la même chose.',
  '- N’ajoute aucun chiffre absent du CV, et ne calcule pas « X ans d’expérience » à partir des dates. Une compétence ' +
    'ou un outil que l’offre demande et que le CV ne cite pas reste absent : ne l’écris nulle part.',
  '- Une réalisation tient sur une ligne, environ 90 caractères, et commence par un verbe d’action. Écris en français.',
  'Pour chaque expérience du CV, réponds par ses réalisations réécrites : les 2 à 4 plus utiles pour l’offre dans les ' +
    'expériences pertinentes, 0 ou 1 dans les autres. Un profil de 3 phrases au plus.',
  'Pour la formation, donne les identifiants des détails à garder (edu_0.d0…), aucun s’ils ne servent pas l’offre. ' +
    'Pour les compétences, certifications, langues et centres d’intérêt, donne les identifiants à garder, les plus ' +
    'utiles pour l’offre d’abord.',
  'Dans changes, liste chaque modification : target ("headline", "profile" ou l’identifiant d’une expérience comme ' +
    '"exp_0") et reason (une phrase qui dit pourquoi ce changement sert cette offre). 30 au plus.',
  'Réponds uniquement par un objet JSON de la forme {"headline":"…" ou null,"profile":"…" ou null,' +
    '"experiences":[{"id":"exp_0","bullets":["…"]}],"education":[{"id":"edu_0","details":["edu_0.d0"]}],' +
    '"skills":["skill_3"],"certifications":[],"languages":[],"interests":[],' +
    '"changes":[{"target":"exp_0","reason":"…"}]}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

const joinParts = (parts: readonly (string | null)[]): string => parts.filter((part) => part !== null).join(' | ');

/** The parsed CV as the model reads it: one line per fact, each preceded by its id. */
export const renderParsedCv = (cv: ParsedCv): string =>
  [
    ...(cv.headline ? [`headline: ${cv.headline}`] : []),
    ...(cv.profile ? [`profile: ${cv.profile}`] : []),
    ...cv.experiences.flatMap((experience) => [
      `${experience.id} — ${joinParts([experience.title, experience.organization, experience.place, experience.dates])}`,
      ...experience.bullets.map((bullet) => `${bullet.id}: ${bullet.text}`),
    ]),
    ...cv.education.flatMap((entry) => [
      `${entry.id} — ${joinParts([entry.degree, entry.school, entry.place, entry.dates])}`,
      ...entry.details.map((detail) => `${detail.id}: ${detail.text}`),
    ]),
    ...[...cv.skills, ...cv.certifications, ...cv.languages, ...cv.interests].map((item) => `${item.id}: ${item.text}`),
  ].join('\n');

/**
 * Prompt of the `tailor_cv` task. The CV, the offer and the diagnostic (itself written by a model) are framed and
 * declared untrusted (ENF-SEC-06). The model points to the facts by id and the code copies them (RG-21); the answer
 * must meet `TailorCvAnswerSchema` (modules/cvWorkshop).
 * @req EF-CVX-25, EF-CVX-29, EF-CVX-47, RG-21, RG-24, ENF-SEC-06, ENF-COU-01
 */
export const buildTailorCvPrompt = ({
  cv,
  offerText,
  diagnosis,
}: CvToTailor): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: [
    frameUntrusted('cv', truncate(renderParsedCv(cv), CV_PROMPT_MAX_LENGTH)),
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
