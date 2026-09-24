import { normalizeKey } from '../lib/text.js';
import type { PageLink } from './page.js';

/**
 * EF-VEI-27 : mots par lesquels un site renvoie à ses offres. Cherchés dans le libellé du lien **et** dans son
 * adresse, parce qu'un site écrit tantôt « Nous rejoindre » avec une adresse `/carrieres`, tantôt l'inverse.
 *
 * L'ordre compte : le premier trouvé gagne, et les termes les plus précis viennent en tête — « nos offres »
 * désigne les offres mieux que « carrières », qui désigne mieux que « jobs ».
 */
const CAREER_WORDS: readonly string[] = [
  'offres d emploi',
  'nos offres',
  'toutes nos offres',
  'offres',
  'postes a pourvoir',
  'job openings',
  'open positions',
  'carrieres',
  'carriere',
  'careers',
  'nous rejoindre',
  'rejoignez nous',
  'join us',
  'recrutement',
  'recrutons',
  'emploi',
  'emplois',
  'jobs',
  'talents',
  'vacatures',
];

/**
 * Parties d'un site qui parlent d'emploi sans lister d'offres : les suivre ferait perdre le rebond sur une page
 * qui ne publie rien.
 */
const NOT_A_BOARD: readonly string[] = [
  'candidature spontanee',
  'spontaneous',
  'politique',
  'mentions legales',
  'cookies',
  'privacy',
  'contact',
  'blog',
  'actualites',
  'news',
];

/** Le chemin d'une adresse, ramené à des mots comparables : « /fr/nos-offres » → « fr nos offres ». */
const pathWords = (url: string): string => normalizeKey(URL.parse(url)?.pathname ?? '');

const holds = (text: string, word: string): boolean => ` ${text} `.includes(` ${word} `);

/** Même site : le même hôte, ou l'un sous-domaine de l'autre — un board vit souvent sur `jobs.exemple.fr`. */
const isSameSite = (candidate: URL, source: URL): boolean =>
  candidate.hostname === source.hostname ||
  candidate.hostname.endsWith(`.${source.hostname}`) ||
  source.hostname.endsWith(`.${candidate.hostname}`);

/**
 * EF-VEI-27 : le lien par lequel un site renvoie à ses offres, ou null quand la page n'en porte aucun.
 *
 * Déterministe et sans appel d'IA : une page d'accueil renvoie presque toujours à ses offres par un lien dont le
 * libellé ou l'adresse le dit. Le lien doit rester sur le site de la source — le code, jamais le modèle, décide
 * où le candidat est envoyé (rules/security.md).
 *
 * @param currentUrl la page déjà lue ; un lien qui y ramène n'est pas un rebond.
 */
export const careerLinkOf = (links: readonly PageLink[], currentUrl: string): string | null => {
  const source = URL.parse(currentUrl);
  if (!source) return null;

  const candidates = links.filter((link) => {
    const target = URL.parse(link.url);
    if (!target || !isSameSite(target, source)) return false;
    if (target.href === source.href || target.pathname === source.pathname) return false;
    const text = `${normalizeKey(link.label)} ${pathWords(link.url)}`;
    return !NOT_A_BOARD.some((word) => holds(text, word));
  });

  for (const word of CAREER_WORDS) {
    const found = candidates.find((link) =>
      holds(`${normalizeKey(link.label)} ${pathWords(link.url)}`, word),
    );
    if (found) return found.url;
  }
  return null;
};
