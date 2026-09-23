import { z } from 'zod';
import { contractTypeOf, htmlToText } from './description.js';
import {
  clamp,
  dateOf,
  jsonOf,
  LOCATION_MAX_LENGTH,
  toNormalizedOffer,
  parseAnswer,
  SlugSchema,
  TITLE_MAX_LENGTH,
  URL_MAX_LENGTH,
  type AdapterDeps,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Greenhouse';
/** Public job board API, meant for third-party sites: no key, no authentication (rules/scraping.md). */
const BOARD_URL = 'https://boards-api.greenhouse.io/v1/boards';
/** The board answers every offer in one call; `content=true` adds the text of each one. */
const jobsUrl = (slug: string): string => `${BOARD_URL}/${encodeURIComponent(slug)}/jobs?content=true`;

/** Name of the metadata field Greenhouse boards use for the contract; boards that have none say nothing. */
const CONTRACT_FIELDS = ['type de contrat', 'contrat', 'employment type', 'contract type', 'job type'];

const MetadataSchema = z.object({
  name: z.string().nullish(),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
});

const JobSchema = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: z.string(),
  updated_at: z.string().nullish(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  metadata: z.array(MetadataSchema).nullish(),
  content: z.string().nullish(),
});

const BoardSchema = z.object({ jobs: z.array(JobSchema) });

type Job = z.infer<typeof JobSchema>;

/** The wording the board put in its contract metadata, whatever the field is named there. */
const contractWordingOf = (job: Job): string | null => {
  const field = (job.metadata ?? []).find((entry) =>
    CONTRACT_FIELDS.includes((entry.name ?? '').toLowerCase()),
  );
  return typeof field?.value === 'string' ? field.value : null;
};

const toOffer = (job: Job): NormalizedOffer =>
  toNormalizedOffer(
    {
    externalId: String(job.id),
    title: clamp(job.title, TITLE_MAX_LENGTH) ?? '',
    location: clamp(job.location?.name, LOCATION_MAX_LENGTH),
    // The title carries the contract when the board declares no metadata for it (« Alternance — … »).
    contractType: contractTypeOf({ labels: [contractWordingOf(job)], text: job.title }),
    url: clamp(job.absolute_url, URL_MAX_LENGTH) ?? '',
    description: htmlToText(job.content),
      postedAt: dateOf(job.updated_at),
    },
    LABEL,
  );

/**
 * Greenhouse job board (EF-VEI-08). The whole board comes in one request, so a check costs a single call
 * to the host (ENF-COL-02).
 */
export const greenhouseAdapter: SourceAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse',
  identifierHint:
    'Nom du board dans l’adresse job-boards.greenhouse.io/‹nom›, par exemple « atelieraurore ».',
  identifierSchema: SlugSchema,
  async fetchOffers(identifier, deps: AdapterDeps) {
    const page = await deps.fetch(jobsUrl(identifier));
    const board = parseAnswer(BoardSchema, jsonOf(page, LABEL), LABEL);
    return board.jobs.map(toOffer);
  },
};
