import { z } from 'zod';
import { contractTypeOf, htmlToText } from './description.js';
import { feedItemsOf, type FeedItem } from './feed.js';
import {
  clamp,
  dateOf,
  LOCATION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Cegid Talentsoft';
/** RG-08 (v1.33): the client sub-domain of talent-soft.com (« ministereinterieur-career »). */
const CLIENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/u;
/** The RSS feed of the offers of a Talentsoft career site, in French (LCID 1036). */
const feedUrl = (client: string): string =>
  `https://${client}.talent-soft.com/handlers/offerRss.ashx?LCID=1036`;
/** « REF-999 - Développeur back-end H/F »: the reference that opens a title is not part of it. */
const LEADING_REFERENCE = /^\S*\d\S*\s+-\s+/u;
const OFFER_ID_PARAMS = ['idOffre', 'offerReference'];
/** Categories of a Talentsoft offer, in this order on the clients seen: trade, contract, place. */
const PLACE_CATEGORY = 2;

const titleOf = (item: FeedItem): string => (item.text('title') ?? '').replace(LEADING_REFERENCE, '');

/** The identifier of the offer in its address — the feed has no `guid` —, or the address itself. */
const externalIdOf = (item: FeedItem): string => {
  const link = item.text('link') ?? '';
  const url = URL.parse(link);
  const found = OFFER_ID_PARAMS.map((name) => url?.searchParams.get(name)).find(Boolean);
  return found ?? link;
};

const toOffer = (item: FeedItem): NormalizedOffer => {
  const categories = item.texts('category');
  return toNormalizedOffer(
    {
      externalId: externalIdOf(item),
      title: clamp(titleOf(item), TITLE_MAX_LENGTH) ?? '',
      location: clamp(categories[PLACE_CATEGORY], LOCATION_MAX_LENGTH),
      contractType: contractTypeOf({ labels: categories, text: titleOf(item) }),
      url: clamp(item.text('link'), URL_MAX_LENGTH) ?? '',
      description: htmlToText(item.text('description')),
      postedAt: dateOf(item.text('pubDate')),
    },
    LABEL,
  );
};

/**
 * Cegid Talentsoft career site (EF-VEI-08, v1.33): the public RSS feed of its offers, one request. Common with large
 * French companies and the public sector.
 * @req EF-VEI-08, RG-08
 */
export const talentsoftAdapter: SourceAdapter = {
  id: 'talentsoft',
  label: 'Cegid Talentsoft',
  identifierHint: 'Début de l’adresse ‹client›.talent-soft.com, par exemple « exemple-career ».',
  identifierSchema: z
    .string()
    .trim()
    .toLowerCase()
    .regex(CLIENT_PATTERN, 'Identifiant invalide : lettres, chiffres et tirets, 63 caractères au plus.'),
  async fetchOffers(identifier, deps) {
    const page = await deps.fetch(feedUrl(identifier));
    return feedItemsOf(page, { label: LABEL, root: 'rss', item: 'item' }).map(toOffer);
  },
};
