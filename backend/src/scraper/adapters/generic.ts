import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildExtractOffersPrompt } from '../../llm/prompts/extractOffers.js';
import { normalizeKey } from '../../lib/text.js';
import { ExtractedOffersSchema, type ExtractedOffer } from '../../modules/offers/extraction.js';
import { readPage, type ReadablePage } from '../page.js';
import { contractTypeOf } from './description.js';
import {
  clamp,
  DESCRIPTION_MAX_LENGTH,
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
export const genericAdapter: SourceAdapter = {
  id: 'generic',
  label: 'Page carrières',
  identifierHint: 'Adresse de la page qui liste les offres, par exemple https://exemple.fr/nous-rejoindre.',
  identifierSchema: CareerPageSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    if (!deps.runTask) {
      throw new SourceFetchError('Une page carrières demande un service d’IA, qu’aucun fournisseur ne rend.');
    }
    const answered = await deps.fetch(identifier);
    if (answered.status !== HTTP_OK) {
      throw new SourceFetchError(`${LABEL} : la page a répondu ${answered.status}.`);
    }
    const address = answered.url || identifier;
    const page = readPage(answered.body, address);
    const { data } = await deps.runTask('extract_offers', {
      ...buildExtractOffersPrompt({ pageUrl: address, text: page.text, links: page.links }),
      schema: ExtractedOffersSchema,
    });
    return data.offers.map((offer) => toOffer(offer, page, address));
  },
};
