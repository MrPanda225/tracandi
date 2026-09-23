import { z } from 'zod';
import { contractTypeOf } from './description.js';
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

const LABEL = 'Lever';
/** Public postings API of a Lever job board: no key, meant to be embedded on the company's own site. */
const POSTINGS_URL = 'https://api.lever.co/v0/postings';
const postingsUrl = (slug: string): string => `${POSTINGS_URL}/${encodeURIComponent(slug)}?mode=json`;

const PostingSchema = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: z.string(),
  createdAt: z.number().nullish(),
  categories: z
    .object({
      location: z.string().nullish(),
      commitment: z.string().nullish(),
      team: z.string().nullish(),
    })
    .nullish(),
  descriptionPlain: z.string().nullish(),
});

const BoardSchema = z.array(PostingSchema);

type Posting = z.infer<typeof PostingSchema>;

const toOffer = (posting: Posting): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: posting.id,
      title: clamp(posting.text, TITLE_MAX_LENGTH) ?? '',
      location: clamp(posting.categories?.location, LOCATION_MAX_LENGTH),
      // `commitment` is where a Lever board states the contract; the title is the fallback.
      contractType: contractTypeOf({ labels: [posting.categories?.commitment], text: posting.text }),
      url: clamp(posting.hostedUrl, URL_MAX_LENGTH) ?? '',
      // Lever publishes the description as plain text: nothing to strip.
      description: clamp(posting.descriptionPlain, DESCRIPTION_MAX_LENGTH),
      postedAt: dateOf(posting.createdAt),
    },
    LABEL,
  );

/** Lever job board (EF-VEI-08): every posting of the board in one request. */
export const leverAdapter: SourceAdapter = {
  id: 'lever',
  label: 'Lever',
  identifierHint: 'Nom du board dans l’adresse jobs.lever.co/‹nom›, par exemple « maisonlumen ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const page = await deps.fetch(postingsUrl(identifier));
    return parseAnswer(BoardSchema, jsonOf(page, LABEL), LABEL).map(toOffer);
  },
};
