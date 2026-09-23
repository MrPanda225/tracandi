import { z } from 'zod';
import { contractTypeOf } from './description.js';
import {
  clamp,
  jsonOf,
  LOCATION_MAX_LENGTH,
  parseAnswer,
  SourceFetchError,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type AdapterDeps,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Workday';
/** RG-08: a Workday source is the address of a career site, on a subdomain of the Workday hosting domain. */
const WORKDAY_DOMAIN = '.myworkdayjobs.com';
/** A locale segment Workday puts in front of the site name (`/fr-FR/Carrieres`), which is not the site. */
const LOCALE_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/i;

/** The search endpoint answers pages of 20; five of them cover the boards a candidate watches. */
const PAGE_SIZE = 20;
const MAX_PAGES = 5;

/** @req EF-VEI-02, RG-08 */
export const WorkdaySiteSchema = z
  .string()
  .trim()
  .max(URL_MAX_LENGTH)
  .superRefine((value, context) => {
    const parsed = URL.parse(value);
    const isWorkday = parsed?.protocol === 'https:' && parsed.hostname.endsWith(WORKDAY_DOMAIN);
    const segments = (parsed?.pathname ?? '').split('/').filter((part) => part !== '');
    if (!isWorkday || segments.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Adresse attendue : celle du site carrières Workday, par exemple ' +
          'https://nova.wd3.myworkdayjobs.com/fr-FR/Carrieres.',
      });
    }
  });

/** Where the offers of a career site are listed, derived from the address the candidate gave (RG-08). */
export const searchUrlOf = (site: string): { origin: string; endpoint: string } => {
  const parsed = URL.parse(site);
  const tenant = parsed?.hostname.split('.')[0] ?? '';
  const segments = (parsed?.pathname ?? '').split('/').filter((part) => part !== '');
  const path = segments.filter((segment) => !LOCALE_SEGMENT.test(segment));
  const siteId = path.at(-1) ?? segments.at(-1);
  if (!parsed || tenant === '' || siteId === undefined) {
    throw new SourceFetchError(`${LABEL} : l’adresse du site carrières n’est pas exploitable.`);
  }
  return { origin: parsed.origin, endpoint: `${parsed.origin}/wday/cxs/${tenant}/${siteId}/jobs` };
};

const PostingSchema = z.object({
  title: z.string(),
  externalPath: z.string(),
  locationsText: z.string().nullish(),
  bulletFields: z.array(z.string()).nullish(),
});

const PageSchema = z.object({
  total: z.number().nullish(),
  jobPostings: z.array(PostingSchema),
});

type Posting = z.infer<typeof PostingSchema>;

const toOffer = (origin: string, posting: Posting): NormalizedOffer => {
  const bullets = posting.bulletFields ?? [];
  return toNormalizedOffer(
    {
      // Workday puts the requisition number first; the path is the fallback when a site publishes none.
      externalId: clamp(bullets[0], URL_MAX_LENGTH) ?? posting.externalPath,
      title: clamp(posting.title, TITLE_MAX_LENGTH) ?? '',
      location: clamp(posting.locationsText, LOCATION_MAX_LENGTH),
      contractType: contractTypeOf({ labels: bullets.slice(1), text: posting.title }),
      url: clamp(`${origin}${posting.externalPath}`, URL_MAX_LENGTH) ?? '',
      // The listing carries no text and `postedOn` is a relative sentence (« Posted 5 Days Ago »), never a date:
      // what cannot be read exactly is left empty rather than guessed.
      description: null,
      postedAt: null,
    },
    LABEL,
  );
};

/**
 * Workday career site (EF-VEI-08). Its listing only answers POST, so this is the one adapter that sends a body;
 * the request still goes through the responsible client, with its robots.txt, its delay and its bounds.
 */
export const workdayAdapter: SourceAdapter = {
  id: 'workday',
  label: 'Workday',
  identifierHint:
    'Adresse du site carrières, par exemple https://nova.wd3.myworkdayjobs.com/fr-FR/Carrieres.',
  identifierSchema: WorkdaySiteSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const { origin, endpoint } = searchUrlOf(identifier);
    const offers: NormalizedOffer[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answered = await deps.fetch(endpoint, {
        method: 'POST',
        json: { appliedFacets: {}, limit: PAGE_SIZE, offset: page * PAGE_SIZE, searchText: '' },
      });
      const read = parseAnswer(PageSchema, jsonOf(answered, LABEL), LABEL);
      offers.push(...read.jobPostings.map((posting) => toOffer(origin, posting)));
      if (read.jobPostings.length < PAGE_SIZE) break;
    }
    return offers;
  },
};
