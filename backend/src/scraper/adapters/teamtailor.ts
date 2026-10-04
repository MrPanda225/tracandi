import { contractTypeOf, htmlToText } from './description.js';
import { feedItemsOf, type FeedItem } from './feed.js';
import {
  clamp,
  dateOf,
  LOCATION_MAX_LENGTH,
  SlugSchema,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Teamtailor';
/** The RSS feed every Teamtailor career site publishes, 100 offers per page by default. */
const feedUrl = (slug: string): string =>
  `https://${encodeURIComponent(slug)}.teamtailor.com/jobs.rss?per_page=100`;
const FULLY_REMOTE = 'fully';

/** The places of the offer — city, else the name of the place —, and « Télétravail » when it is fully remote. */
const placeOf = (item: FeedItem): string | null => {
  const places = item.texts('tt:locations tt:location tt:city');
  const named = places.length > 0 ? places : item.texts('tt:locations tt:location tt:name');
  const remote = item.text('remoteStatus') === FULLY_REMOTE ? ['Télétravail'] : [];
  return clamp([...new Set([...named, ...remote])].join(', '), LOCATION_MAX_LENGTH);
};

const toOffer = (item: FeedItem): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: item.text('guid') ?? item.text('link') ?? '',
      title: clamp(item.text('title'), TITLE_MAX_LENGTH) ?? '',
      location: placeOf(item),
      // The feed states no contract: only the title can name one (« Alternance — … »).
      contractType: contractTypeOf({ text: item.text('title') }),
      url: clamp(item.text('link'), URL_MAX_LENGTH) ?? '',
      description: htmlToText(item.text('description')),
      postedAt: dateOf(item.text('pubDate')),
    },
    LABEL,
  );

/**
 * Teamtailor career site (EF-VEI-08, v1.33): the public RSS feed its documentation offers to career sites, one
 * request for up to 100 offers.
 * @req EF-VEI-08, RG-08
 */
export const teamtailorAdapter: SourceAdapter = {
  id: 'teamtailor',
  label: 'Teamtailor',
  identifierHint: 'Nom du site dans l’adresse ‹nom›.teamtailor.com, par exemple « exemplia ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps) {
    const page = await deps.fetch(feedUrl(identifier));
    return feedItemsOf(page, { label: LABEL, root: 'rss', item: 'item' }).map(toOffer);
  },
};
