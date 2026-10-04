import { z } from 'zod';
import { contractTypeOf, htmlToText } from './description.js';
import {
  clamp,
  dateOf,
  jsonOf,
  LOCATION_MAX_LENGTH,
  parseAnswer,
  TITLE_MAX_LENGTH,
  toNormalizedOffer,
  URL_MAX_LENGTH,
  type NormalizedOffer,
  type SourceAdapter,
} from './types.js';

const LABEL = 'Ashby';
/** RG-08 (v1.33): the board name of jobs.ashbyhq.com/‹board›, its case kept — Ashby may tell two cases apart. */
const BOARD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/u;
/** The public job posting API of an Ashby board, documented for career sites. */
const boardUrl = (board: string): string =>
  `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}`;
/** Ashby's employment types, in the wording the glossary reads (EF-VEI-21); « FullTime » names no contract. */
const EMPLOYMENT_TYPES: Readonly<Record<string, string>> = {
  Intern: 'intern',
  Contract: 'contract',
  Temporary: 'temporary',
};

const JobSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  location: z.string().nullish(),
  employmentType: z.string().nullish(),
  isListed: z.boolean().nullish(),
  isRemote: z.boolean().nullish(),
  publishedAt: z.string().nullish(),
  jobUrl: z.string(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
});

const BoardSchema = z.object({ jobs: z.array(JobSchema) });

type Job = z.infer<typeof JobSchema>;

const placeOf = (job: Job): string | null =>
  clamp([job.location, job.isRemote ? 'Télétravail' : null].filter(Boolean).join(', '), LOCATION_MAX_LENGTH);

const toOffer = (job: Job): NormalizedOffer =>
  toNormalizedOffer(
    {
      externalId: job.id,
      title: clamp(job.title, TITLE_MAX_LENGTH) ?? '',
      location: placeOf(job),
      contractType: contractTypeOf({
        labels: [job.employmentType ? EMPLOYMENT_TYPES[job.employmentType] : null],
        text: job.title,
      }),
      url: clamp(job.jobUrl, URL_MAX_LENGTH) ?? '',
      description: htmlToText(job.descriptionHtml) ?? htmlToText(job.descriptionPlain),
      postedAt: dateOf(job.publishedAt),
    },
    LABEL,
  );

/**
 * Ashby job board (EF-VEI-08, v1.33): the public posting API, every listed offer and its text in one request.
 * @req EF-VEI-08, RG-08
 */
export const ashbyAdapter: SourceAdapter = {
  id: 'ashby',
  label: 'Ashby',
  identifierHint: 'Nom du board dans l’adresse jobs.ashbyhq.com/‹nom›, par exemple « Exemplia ».',
  identifierSchema: z
    .string()
    .trim()
    .regex(
      BOARD_PATTERN,
      'Identifiant invalide : lettres, chiffres, point, tiret ou tiret bas, 81 caractères au plus.',
    ),
  async fetchOffers(identifier, deps) {
    const page = await deps.fetch(boardUrl(identifier));
    const board = parseAnswer(BoardSchema, jsonOf(page, LABEL), LABEL);
    // Only what the board shows publicly: an unlisted offer is not meant for applicants.
    return board.jobs.filter((job) => job.isListed !== false).map(toOffer);
  },
};
