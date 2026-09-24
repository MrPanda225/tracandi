import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildExtractOffersPrompt } from '../../llm/prompts/extractOffers.js';
import { normalizeKey } from '../../lib/text.js';
import { ExtractedOffersSchema, type ExtractedOffer } from '../../modules/offers/extraction.js';
import { careerLinkOf, isSiteRoot } from '../careerLink.js';
import { readPage, type ReadablePage } from '../page.js';
import {
  addressOf as declaredAddressOf,
  employmentOf,
  identifierOf as declaredIdentifierOf,
  placeOf,
  readStructuredJobs,
  type JobPosting,
} from '../structuredJobs.js';
import { contractTypeOf, htmlToText } from './description.js';
import {
  clamp,
  dateOf,
  DESCRIPTION_MAX_LENGTH,
  EXTERNAL_ID_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  SourceFetchError,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type AdapterDeps,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Page carrières';
const HTTP_OK = 200;
const EXTERNAL_ID_LENGTH = 32;

/** RG-08: a generic source is the https address of a career page. */
export const CareerPageSchema = z
  .string()
  .trim()
  .max(URL_MAX_LENGTH)
  .superRefine((value, context) => {
    if (URL.parse(value)?.protocol !== 'https:') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Adresse attendue : celle de la page carrières, en https, par exemple https://exemple.fr/carrieres.',
      });
    }
  });

/**
 * Whether two addresses belong to the same site: the same host, or one a subdomain of the other — a board often
 * lives on `jobs.exemple.fr` while its page is on `exemple.fr`. Comparing whole hostnames rather than a
 * « registrable domain » avoids needing a public suffix list, which would be wrong for `exemple.co.uk`.
 */
const isSameSite = (candidate: URL, source: URL): boolean =>
  candidate.hostname === source.hostname ||
  candidate.hostname.endsWith(`.${source.hostname}`) ||
  source.hostname.endsWith(`.${candidate.hostname}`);

/**
 * The address of an offer, kept only when the model copied it from a link of the page **and** that link stays on
 * the site of the source. Anything else — an invented address, a job board elsewhere, a tracking redirect — is
 * dropped and the offer points at the page it was read on: the candidate is never sent where the source did not
 * send them (security.md, ENF-SEC-06).
 */
const addressOf = (offer: ExtractedOffer, page: ReadablePage, pageUrl: string): string => {
  if (offer.url === null) return pageUrl;
  const proposed = URL.parse(offer.url);
  const source = URL.parse(pageUrl);
  const isOnThePage = page.links.some((link) => link.url === offer.url);
  if (!proposed || !source || !isOnThePage || !isSameSite(proposed, source)) return pageUrl;
  return proposed.href;
};

/**
 * EF-VEI-09: an identifier stable from one check to the next. The address of the offer is the natural one; a page
 * that links to none falls back on its title. Both are hashed so the identifier stays inside the column, whatever
 * the length of the address.
 */
const identifierOf = (address: string, title: string, pageUrl: string): string =>
  createHash('sha256')
    .update(address === pageUrl ? `${pageUrl}#${normalizeKey(title)}` : address)
    .digest('hex')
    .slice(0, EXTERNAL_ID_LENGTH);

const toOffer = (offer: ExtractedOffer, page: ReadablePage, pageUrl: string): NormalizedOffer => {
  const address = addressOf(offer, page, pageUrl);
  return toNormalizedOffer(
    {
      externalId: identifierOf(address, offer.title, pageUrl),
      title: clamp(offer.title, TITLE_MAX_LENGTH) ?? '',
      location: clamp(offer.location, LOCATION_MAX_LENGTH),
      contractType: contractTypeOf({ labels: [offer.contract], text: offer.title }),
      url: address,
      description: clamp(offer.summary, DESCRIPTION_MAX_LENGTH),
      // A career page rarely dates its offers, and « publiée récemment » is not a date: nothing is guessed here.
      postedAt: null,
    },
    LABEL,
  );
};

/**
 * Career page of a company that runs no ATS job board (EF-VEI-08). Last resort of the watch: the page is read as
 * text and links, a model extracts what looks like an offer, and the code — not the model — decides where the
 * candidate may be sent.
 */
/**
 * EF-VEI-28 : une offre balisée, ramenée au modèle de la veille. Les mêmes contrôles que pour une offre extraite
 * par l'IA s'appliquent — l'adresse n'est retenue que si elle reste sur le site de la source, et chaque texte est
 * borné : un balisage est du contenu non fiable comme un autre (rules/security.md).
 */
const fromStructured = (posting: JobPosting, page: ReadablePage, pageUrl: string): NormalizedOffer => {
  const declared = declaredAddressOf(posting);
  const proposed = declared === null ? null : URL.parse(declared, pageUrl);
  const source = URL.parse(pageUrl);
  const address = proposed && source && isSameSite(proposed, source) ? proposed.href : pageUrl;
  const title = clamp(posting.title, TITLE_MAX_LENGTH) ?? '';

  return toNormalizedOffer(
    {
      // L'identifiant de la source d'abord : il survit à un changement d'adresse (EF-VEI-09).
      externalId: clamp(declaredIdentifierOf(posting), EXTERNAL_ID_MAX_LENGTH) ?? identifierOf(address, title, pageUrl),
      title,
      location: clamp(placeOf(posting), LOCATION_MAX_LENGTH),
      /* Le vocabulaire de schema.org ne connaît ni CDI, ni CDD, ni alternance : un poste en alternance y est
         balisé « INTERN ». Le titre, écrit en français, est donc plus juste quand il nomme un contrat. */
      contractType:
        contractTypeOf({ text: title }) === 'non_precise'
          ? contractTypeOf({ labels: [employmentOf(posting)] })
          : contractTypeOf({ text: title }),
      url: address,
      // La description balisée est du HTML dans la plupart des cas.
      description: htmlToText(posting.description ?? null),
      postedAt: dateOf(posting.datePosted),
    },
    LABEL,
  );
};

/** Une page lue, avec l'adresse qu'elle porte après redirections. */
interface ReadAddress {
  address: string;
  page: ReadablePage;
}

/** @throws SourceFetchError quand la page ne répond pas 200. */
const read = async (url: string, deps: AdapterDeps): Promise<ReadAddress> => {
  const answered = await deps.fetch(url);
  if (answered.status !== HTTP_OK) {
    throw new SourceFetchError(`${LABEL} : la page a répondu ${answered.status}.`);
  }
  const address = answered.url || url;
  return { address, page: readPage(answered.body, address) };
};

/**
 * EF-VEI-27, second recours : l'adresse que le modèle a repérée, retenue aux mêmes conditions qu'une offre —
 * **présente parmi les liens de la page** et sur le site de la source. Les mots-clés ne servent pas ici : le
 * modèle a lu la page, c'est son jugement qu'on vérifie, pas le libellé du lien.
 */
const proposedCareerPage = (proposed: string | null, from: ReadAddress): string | null => {
  if (proposed === null) return null;
  const target = URL.parse(proposed);
  const source = URL.parse(from.address);
  const isOnThePage = from.page.links.some((link) => link.url === proposed);
  return target && source && isOnThePage && isSameSite(target, source) ? target.href : null;
};

/**
 * Page carrières d'une entreprise sans job board (EF-VEI-08). Dernier recours de la veille : la page est réduite
 * à son texte et à ses liens, un modèle en extrait ce qui ressemble à une offre, et le code — jamais le modèle —
 * décide où le candidat peut être envoyé.
 *
 * EF-VEI-27 : l'adresse enregistrée est souvent la **racine du site**, qui ne publie rien. Un rebond est alors
 * fait vers la page qui liste les offres — d'abord par le lien que le site porte lui-même, sans aucun appel
 * d'IA, puis à défaut par l'adresse que le modèle a repérée. **Un seul rebond** : jamais de parcours de site.
 */
export const genericAdapter: SourceAdapter = {
  id: 'generic',
  label: 'Page carrières',
  identifierHint: 'Adresse de la page qui liste les offres, par exemple https://exemple.fr/nous-rejoindre.',
  identifierSchema: CareerPageSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const runTask = deps.runTask;
    if (!runTask) {
      throw new SourceFetchError('Une page carrières demande un service d’IA, qu’aucun fournisseur ne rend.');
    }

    const extract = async ({ address, page }: ReadAddress) =>
      (
        await runTask('extract_offers', {
          ...buildExtractOffersPrompt({ pageUrl: address, text: page.text, links: page.links }),
          schema: ExtractedOffersSchema,
        })
      ).data;

    const landing = await read(identifier, deps);

    /* EF-VEI-27 : depuis l'accueil seulement, on suit le lien que le site porte vers ses offres — déterministe,
       et il épargne un appel d'IA. Sur un chemin plus profond, la page est censée lister les offres : rebondir
       sur un de ses liens ferait quitter le board pour une offre isolée. */
    const known = isSiteRoot(landing.address) ? careerLinkOf(landing.page.links, landing.address) : null;
    const board = known === null ? landing : await read(known, deps);

    /* EF-VEI-28 : ce que la page publie déjà sous forme balisée, sans rien demander à un modèle. C'est le cas
       le plus fréquent — les entreprises balisent leurs offres pour Google for Jobs — et le plus fiable : la
       date de publication et le type de contrat viennent de la source, au lieu d'être devinés. */
    const structured = readStructuredJobs(board.page.jsonBlocks);
    if (structured.length > 0) {
      return structured.map((posting) => fromStructured(posting, board.page, board.address));
    }

    const found = await extract(board);
    if (found.offers.length > 0 || known !== null) {
      return found.offers.map((offer) => toOffer(offer, board.page, board.address));
    }

    // Rien de balisé, rien d'extrait, et le site n'a nommé aucun lien : l'adresse que le modèle a repérée.
    const proposed = proposedCareerPage(found.careerPageUrl, board);
    if (proposed === null) return [];

    const second = await read(proposed, deps);
    const marked = readStructuredJobs(second.page.jsonBlocks);
    if (marked.length > 0) return marked.map((posting) => fromStructured(posting, second.page, second.address));
    return (await extract(second)).offers.map((offer) => toOffer(offer, second.page, second.address));
  },
};
