import { contractTypeOf, htmlToText } from './description.js';
import { feedItemsOf, type FeedItem } from './feed.js';
import {
  clamp,
  dateOf,
  DESCRIPTION_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  SlugSchema,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Personio';
const siteOf = (slug: string): string => `https://${encodeURIComponent(slug)}.jobs.personio.de`;
/** The XML feed Personio documents for career sites, in French when the company wrote its offers in French. */
const feedUrl = (slug: string): string => `${siteOf(slug)}/xml?language=fr`;

/** Every section of the offer (« Vos missions », « Votre profil »…), titled, as one text. */
const descriptionOf = (item: FeedItem): string | null => {
  const names = item.texts('jobDescriptions jobDescription name');
  const values = item.texts('jobDescriptions jobDescription value');
  const sections = values
    .map((value, index) => {
      const text = htmlToText(value);
      return text === null ? null : [names[index], text].filter(Boolean).join('\n');
    })
    .filter((section): section is string => section !== null);
  return sections.length === 0 ? null : clamp(sections.join('\n\n'), DESCRIPTION_MAX_LENGTH);
};

const placeOf = (item: FeedItem): string | null =>
  clamp([...new Set(item.texts('office'))].join(', '), LOCATION_MAX_LENGTH);

const toOffer =
  (slug: string) =>
  (item: FeedItem): NormalizedOffer => {
    const id = item.text('id') ?? '';
    return toNormalizedOffer(
      {
        externalId: id,
        title: clamp(item.text('name'), TITLE_MAX_LENGTH) ?? '',
        location: placeOf(item),
        // « permanent », « fixed_term », « working_student »…: read as the glossary names them (EF-VEI-21).
        contractType: contractTypeOf({ labels: [item.text('employmentType')], text: item.text('name') }),
        url: `${siteOf(slug)}/job/${encodeURIComponent(id)}`,
        description: descriptionOf(item),
        postedAt: dateOf(item.text('createdAt')),
      },
      LABEL,
    );
  };

/**
 * Personio career site (EF-VEI-08, v1.33): the XML feed of the open positions, one request.
 * @req EF-VEI-08, RG-08
 */
export const personioAdapter: SourceAdapter = {
  id: 'personio',
  label: 'Personio',
  identifierHint: 'Nom du site dans l’adresse ‹nom›.jobs.personio.de, par exemple « exemplia ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps) {
    const page = await deps.fetch(feedUrl(identifier));
    return feedItemsOf(page, { label: LABEL, root: 'workzag-jobs', item: 'position' }).map(
      toOffer(identifier),
    );
  },
};
