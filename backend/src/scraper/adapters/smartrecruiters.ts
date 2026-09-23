import { z } from 'zod';
import { contractTypeOf } from './description.js';
import {
  clamp,
  dateOf,
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

const LABEL = 'SmartRecruiters';
/** Public postings API of a SmartRecruiters career site: no key. */
const POSTINGS_URL = 'https://api.smartrecruiters.com/v1/companies';
/** Where the candidate reads an offer, as opposed to the API address the listing carries. */
const CAREERS_URL = 'https://jobs.smartrecruiters.com';

/** The listing is paginated. Five pages cover 500 offers — beyond that a career site is not a watch target. */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

const postingsUrl = (slug: string, offset: number): string =>
  `${POSTINGS_URL}/${encodeURIComponent(slug)}/postings?limit=${PAGE_SIZE}&offset=${offset}`;

const PostingSchema = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().nullish(),
  location: z
    .object({ city: z.string().nullish(), region: z.string().nullish(), remote: z.boolean().nullish() })
    .nullish(),
  typeOfEmployment: z.object({ label: z.string().nullish() }).nullish(),
});

const PageSchema = z.object({
  content: z.array(PostingSchema),
  totalFound: z.number().nullish(),
});

type Posting = z.infer<typeof PostingSchema>;

/** City and region as one line; « Télétravail » when the site only says the offer is remote. */
const locationOf = (posting: Posting): string | null => {
  const parts = [posting.location?.city, posting.location?.region].filter(
    (part) => (part ?? '').trim() !== '',
  );
  if (parts.length > 0) return clamp(parts.join(', '), LOCATION_MAX_LENGTH);
  return posting.location?.remote === true ? 'Télétravail' : null;
};

const toOffer = (slug: string, posting: Posting): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: posting.id,
      title: clamp(posting.name, TITLE_MAX_LENGTH) ?? '',
      location: locationOf(posting),
      contractType: contractTypeOf({ labels: [posting.typeOfEmployment?.label], text: posting.name }),
      url: clamp(`${CAREERS_URL}/${slug}/${posting.id}`, URL_MAX_LENGTH) ?? '',
      // The listing carries no text; the description of a new offer is read from its own page by T-404, so that a
      // check does not cost one extra request per offer (three seconds apiece, ENF-COL-02).
      description: null,
      postedAt: dateOf(posting.releasedDate),
    },
    LABEL,
  );

/** SmartRecruiters career site (EF-VEI-08), read page by page until the site stops answering offers. */
export const smartrecruitersAdapter: SourceAdapter = {
  id: 'smartrecruiters',
  label: 'SmartRecruiters',
  identifierHint:
    'Nom de l’entreprise dans l’adresse jobs.smartrecruiters.com/‹nom›, par exemple « novagroup ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const offers: NormalizedOffer[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answered = await deps.fetch(postingsUrl(identifier, page * PAGE_SIZE));
      const read = parseAnswer(PageSchema, jsonOf(answered, LABEL), LABEL);
      offers.push(...read.content.map((posting) => toOffer(identifier, posting)));
      if (read.content.length < PAGE_SIZE) break;
    }
    return offers;
  },
};
