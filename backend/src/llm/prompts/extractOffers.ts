import type { PageLink } from '../../scraper/page.js';
import { frameUntrusted, truncate, UNTRUSTED_CONTENT_NOTICE } from './untrusted.js';

/** ENF-COU-01: bounds of what one extraction sends, whatever the size of the page. */
export const PROMPT_TEXT_MAX_LENGTH = 12_000;
export const PROMPT_LINKS_MAX = 120;
const LINK_LABEL_MAX_LENGTH = 200;
const LINK_URL_MAX_LENGTH = 300;

/** What the extraction is given of a career page. */
export interface PageToExtract {
  /** Address of the page itself, so the model can tell an offer of this site from an outside one. */
  pageUrl: string;
  text: string;
  links: readonly PageLink[];
}

const SYSTEM = [
  'Tu lis la page carrières d’une entreprise et tu en extrais les offres d’emploi qu’elle publie.',
  'Le texte de la page est placé entre balises <page_text>, ses liens entre balises <page_links>.',
  'Pour chaque offre réellement publiée sur cette page, donne :',
  '- "title" : l’intitulé du poste, tel qu’il est écrit ;',
  '- "url" : l’adresse exacte de l’offre, recopiée depuis <page_links> sans la modifier ; null si aucun lien de ' +
    'la liste ne correspond à cette offre ;',
  '- "location" : le lieu de travail indiqué ; null s’il n’y en a pas ;',
  '- "contract" : le type de contrat écrit sur la page (CDI, CDD, alternance, stage…) ; null s’il n’est pas écrit ;',
  '- "summary" : une ou deux phrases de la page décrivant le poste ; null si la page n’en dit rien.',
  'N’invente jamais une offre, un lieu, un contrat ni une adresse : si la page ne le dit pas, réponds null.',
  'Ignore les liens de navigation, de candidature spontanée, de mentions légales et de réseaux sociaux : ce ne ' +
    'sont pas des offres.',
  'Si la page ne publie aucune offre mais renvoie vers celle qui les liste — « Carrières », « Nous rejoindre », « Nos offres » —, donne son adresse dans "careerPageUrl", recopiée depuis <page_links> sans la modifier ; sinon "careerPageUrl" vaut null.',
  'Si la page ne publie aucune offre, réponds {"offers":[]}.',
  'Réponds uniquement par un objet JSON de la forme {"offers":[{"title":"Data Analyst",' +
    '"url":"https://exemple.fr/offres/data-analyst","location":"Paris","contract":"CDI",' +
    '"summary":"Construction des tableaux de bord."}],"careerPageUrl":null}.',
  UNTRUSTED_CONTENT_NOTICE,
].join('\n');

const describeLinks = (links: readonly PageLink[]): string =>
  links
    .slice(0, PROMPT_LINKS_MAX)
    .map(
      (link) => `${truncate(link.label, LINK_LABEL_MAX_LENGTH)} → ${truncate(link.url, LINK_URL_MAX_LENGTH)}`,
    )
    .join('\n');

/**
 * Prompt of the `extract_offers` task for one career page. The text and the links both come from the outside and
 * are framed and declared untrusted (ENF-SEC-06); the address of the page is set by the application, never taken
 * from the content. Expected answer: `ExtractedOffersSchema` (modules/offers).
 * @req EF-VEI-08, ENF-SEC-06, ENF-COU-01
 */
export const buildExtractOffersPrompt = (page: PageToExtract): { system: string; prompt: string } => ({
  system: SYSTEM,
  prompt: [
    frameUntrusted('page_text', truncate(page.text, PROMPT_TEXT_MAX_LENGTH), { source: page.pageUrl }),
    frameUntrusted('page_links', describeLinks(page.links), { source: page.pageUrl }),
  ].join('\n\n'),
});
