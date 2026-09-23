import { z } from 'zod';
import { contractTypeOf, htmlToText } from './description.js';
import {
  clamp,
  dateOf,
  DESCRIPTION_MAX_LENGTH,
  jsonOf,
  LOCATION_MAX_LENGTH,
  parseAnswer,
  SlugSchema,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type AdapterDeps,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Recruitee';
/** Public offers API of a Recruitee career site, served by the site itself: no key. */
const offersUrl = (slug: string): string => `https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`;

const OfferSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  careers_url: z.string(),
  location: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  employment_type_code: z.string().nullish(),
  created_at: z.string().nullish(),
  status: z.string().nullish(),
  description: z.string().nullish(),
  requirements: z.string().nullish(),
});

const BoardSchema = z.object({ offers: z.array(OfferSchema) });

type Offer = z.infer<typeof OfferSchema>;

/** The description and the requirements are two HTML blocks; the candidate wants both. */
const textOf = (offer: Offer): string | null => {
  const parts = [htmlToText(offer.description), htmlToText(offer.requirements)].filter(
    (part): part is string => part !== null,
  );
  return parts.length === 0 ? null : clamp(parts.join('\n\n'), DESCRIPTION_MAX_LENGTH);
};

/** The first place the site states: an empty field is not a place, so it falls through to the next one. */
const placeOf = (offer: Offer): string | null =>
  clamp(offer.location, LOCATION_MAX_LENGTH) ??
  clamp(offer.city, LOCATION_MAX_LENGTH) ??
  clamp(offer.country, LOCATION_MAX_LENGTH);

const toOffer = (offer: Offer): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: String(offer.id),
      title: clamp(offer.title, TITLE_MAX_LENGTH) ?? '',
      location: placeOf(offer),
      contractType: contractTypeOf({ labels: [offer.employment_type_code], text: offer.title }),
      url: clamp(offer.careers_url, URL_MAX_LENGTH) ?? '',
      description: textOf(offer),
      postedAt: dateOf(offer.created_at),
    },
    LABEL,
  );

/**
 * Recruitee career site (EF-VEI-08). Only the published offers are kept: a site also lists the ones it has
 * closed or not yet opened, which the candidate must never be sent to.
 */
export const recruiteeAdapter: SourceAdapter = {
  id: 'recruitee',
  label: 'Recruitee',
  identifierHint: 'Nom du site dans l’adresse ‹nom›.recruitee.com, par exemple « cielbleu ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const page = await deps.fetch(offersUrl(identifier));
    const board = parseAnswer(BoardSchema, jsonOf(page, LABEL), LABEL);
    return board.offers.filter((offer) => (offer.status ?? 'published') === 'published').map(toOffer);
  },
};
