import { z } from 'zod';
import { contractTypeOf, htmlToText } from './description.js';
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
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Workable';
/** The public widget API of a Workable account, meant for career sites; `details` adds the text of each offer. */
const accountUrl = (account: string): string =>
  `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}?details=true`;

const JobSchema = z.object({
  shortcode: z.string().min(1),
  title: z.string(),
  url: z.string().nullish(),
  shortlink: z.string().nullish(),
  employment_type: z.string().nullish(),
  telecommuting: z.boolean().nullish(),
  published_on: z.string().nullish(),
  created_at: z.string().nullish(),
  city: z.string().nullish(),
  country: z.string().nullish(),
  description: z.string().nullish(),
});

const AccountSchema = z.object({ jobs: z.array(JobSchema) });

type Job = z.infer<typeof JobSchema>;

const placeOf = (job: Job): string | null =>
  clamp(
    [job.city, job.country, job.telecommuting ? 'Télétravail' : null].filter(Boolean).join(', '),
    LOCATION_MAX_LENGTH,
  );

const toOffer = (job: Job): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: job.shortcode,
      title: clamp(job.title, TITLE_MAX_LENGTH) ?? '',
      location: placeOf(job),
      contractType: contractTypeOf({ labels: [job.employment_type], text: job.title }),
      url: clamp(job.url ?? job.shortlink, URL_MAX_LENGTH) ?? '',
      description: htmlToText(job.description),
      postedAt: dateOf(job.published_on ?? job.created_at),
    },
    LABEL,
  );

/**
 * Workable account (EF-VEI-08, v1.33): the public widget API, every offer and its text in one request.
 * @req EF-VEI-08, RG-08
 */
export const workableAdapter: SourceAdapter = {
  id: 'workable',
  label: 'Workable',
  identifierHint: 'Nom du compte dans l’adresse apply.workable.com/‹nom›, par exemple « exemplia ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps) {
    const page = await deps.fetch(accountUrl(identifier));
    return parseAnswer(AccountSchema, jsonOf(page, LABEL), LABEL).jobs.map(toOffer);
  },
};
