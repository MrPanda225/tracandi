import type { CvLine } from '../../modules/cvWorkshop/cvLines.js';
import { frameUntrusted, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

const SYSTEM = [
  'Tu structures un CV. Le CV est placé entre balises <cv>, une ligne par ligne, chacune précédée de son numéro : ' +
    'L1: …, L2: …',
  'Tu ne réécris rien : pour chaque information, tu indiques le numéro de la ligne où elle se trouve et le texte ' +
    'exact tel qu’il y est écrit. Ne reformule pas, ne traduis pas, ne complète pas, n’abrège pas, ne corrige pas.',
  'Une référence est {"line":12,"text":"…"} ; si l’information passe sur plusieurs lignes consécutives, ajoute ' +
    '"toLine":13 (numéro de la dernière ligne). Quand le CV ne donne pas une information, mets null.',
  'Réponds uniquement par un objet JSON de la forme {"headline":Ref|null,"profile":[Ref],' +
    '"experiences":[{"title":Ref,"organization":Ref|null,"place":Ref|null,"dates":Ref|null,"bullets":[Ref]}],' +
    '"education":[{"degree":Ref,"school":Ref|null,"place":Ref|null,"dates":Ref|null,"details":[Ref]}],' +
    '"skills":[Ref],"certifications":[Ref],"languages":[Ref],"interests":[Ref]}.',
  '- headline : le titre professionnel sous le nom, s’il y en a un ; profile : les lignes du résumé de profil ;',
  '- experiences : une entrée par poste, du plus récent au plus ancien ; title est l’intitulé du poste, organization ' +
    'l’employeur, place le lieu, dates la période, bullets chaque puce de missions ou de réalisations ;',
  '- education : une entrée par formation ; degree est le diplôme, school l’établissement, details les puces ;',
  '- skills, certifications, languages, interests : un élément par référence (une compétence, un diplôme ou ' +
    'certificat, une langue, un centre d’intérêt), tel qu’écrit.',
  'Les chiffres, les dates et les noms propres sont recopiés tels quels de la ligne indiquée.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

/**
 * Prompt of the `parse_cv` task: the numbered lines of the CV (contact details already taken out), framed and declared
 * untrusted (ENF-SEC-06). The model answers with references to the lines; the code copies the text (RG-21).
 * Expected answer: `ParseCvAnswerSchema` (modules/cvWorkshop).
 * @req EF-CVX-46, RG-21, ENF-SEC-06
 */
export const buildParseCvPrompt = (lines: readonly CvLine[]): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: frameUntrusted('cv', lines.map(({ id, text }) => `L${id}: ${text}`).join('\n')),
});
