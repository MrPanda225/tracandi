import { z } from 'zod';
import { contractType, siteAdapter } from '../../db/schema.js';
import type { RunTaskInput, TaskResult } from '../../llm/router.js';
import type { LlmTaskName } from '../../llm/types.js';
import type { CollectedPage, RequestOptions } from '../http.js';

/** One of the source types of the data model (`site_adapter`). */
export type SiteAdapterId = (typeof siteAdapter.enumValues)[number];
/** One of the contract types of the glossary (`contract_type`). */
export type OfferContractType = (typeof contractType.enumValues)[number];

/** RG-08: slug of an ATS job board, case-insensitive. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

/** Bounds of `job_offers` (schema.ts): an over-long field is cut, never a reason to lose the offer. */
export const TITLE_MAX_LENGTH = 300;
export const LOCATION_MAX_LENGTH = 200;
export const URL_MAX_LENGTH = 1000;
export const EXTERNAL_ID_MAX_LENGTH = 255;
/** The description feeds the scoring prompt (RG-09): long enough to judge, short enough to send. */
export const DESCRIPTION_MAX_LENGTH = 5000;

/**
 * RG-08: identifier of a source held on an ATS job board. The value is lower-cased, because the same board
 * written in two cases would otherwise be watched twice (`uq_watched_sites_source`).
 * @req EF-VEI-02
 */
export const SlugSchema = z
  .string()
  .trim()
  .regex(
    SLUG_PATTERN,
    'Identifiant invalide : lettres, chiffres, point, tiret ou tiret bas, 81 caractères au plus.',
  )
  .transform((value) => value.toLowerCase());

/** An offer as every adapter hands it over, whatever the shape of the source (EF-VEI-08). */
export const NormalizedOfferSchema = z.object({
  /** Identifier of the offer at the source, stable between two checks (EF-VEI-09). */
  externalId: z.string().min(1).max(EXTERNAL_ID_MAX_LENGTH),
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  location: z.string().max(LOCATION_MAX_LENGTH).nullable(),
  contractType: z.enum(contractType.enumValues),
  url: z.string().max(URL_MAX_LENGTH).startsWith('https://'),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).nullable(),
  postedAt: z.date().nullable(),
});

export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;

/**
 * What an adapter is given to do its work: the responsible client (rules/scraping.md) and, for the sources that
 * need one, the AI router. `runTask` is optional because only the generic career page reads a site through a
 * model; an adapter that needs it and does not get it says so rather than answering nothing (EF-IA-04).
 */
export interface AdapterDeps {
  fetch: (url: string, options?: RequestOptions) => Promise<CollectedPage>;
  runTask?: RunAdapterTask;
}

/**
 * The AI router as an adapter sees it: already bound to the candidate whose watch is running, so that no adapter
 * has to carry a user identifier around to have its call journalled (EF-IA-06).
 */
export type RunAdapterTask = <T>(
  task: LlmTaskName,
  input: Omit<RunTaskInput<T>, 'userId'>,
) => Promise<TaskResult<T>>;

/**
 * A type of source of the watch. Adding one means writing a file here and adding it to the registry, nothing else.
 * @req EF-VEI-08, ENF-MAI-03
 */
export interface SourceAdapter {
  /** Value of the `site_adapter` enumeration this adapter answers for. */
  readonly id: SiteAdapterId;
  /** Name shown to the candidate when choosing a type of source. */
  readonly label: string;
  /** What the candidate must type, in French (EF-VEI-01). */
  readonly identifierHint: string;
  /** RG-08 for this type; refuses anything else (EF-VEI-02). */
  readonly identifierSchema: z.ZodType<string, z.ZodTypeDef, unknown>;
  /**
   * The offers published on the source right now, oldest field cut to the bounds of the data model.
   * @throws SourceFetchError when the source answers something unusable; the failure stays on that source (ENF-FIA-02).
   */
  readonly fetchOffers: (identifier: string, deps: AdapterDeps) => Promise<NormalizedOffer[]>;
}

/**
 * A source that could not be read. The message is in French: it is stored on the source and shown to the
 * candidate beside it (EF-VEI-11).
 */
export class SourceFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SourceFetchError';
  }
}

const HTTP_OK = 200;

/**
 * The JSON body of a page an ATS answered.
 * @throws SourceFetchError on any status other than 200, or on a body that is not JSON.
 */
export const jsonOf = (page: CollectedPage, label: string): unknown => {
  if (page.status !== HTTP_OK) throw new SourceFetchError(`${label} a répondu ${page.status}.`);
  try {
    return JSON.parse(page.body);
  } catch (failure) {
    throw new SourceFetchError(`${label} n’a pas renvoyé de JSON.`, { cause: failure });
  }
};

/**
 * The answer read through its schema: an ATS that changes its format is a failure of that source alone, never an
 * exception that stops the watch (ENF-FIA-02).
 * @throws SourceFetchError
 */
export const parseAnswer = <T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
  label: string,
): T => {
  const read = schema.safeParse(value);
  if (!read.success) {
    const fields = read.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new SourceFetchError(`${label} a renvoyé une réponse inattendue (${fields || 'format'}).`);
  }
  return read.data;
};

/**
 * One offer of a source, read through the shared schema: a source whose answer cannot be normalised fails on its
 * own, with a message the candidate can read (EF-VEI-11), instead of raising a `ZodError` through the watch.
 * @throws SourceFetchError
 */
export const toNormalizedOffer = (value: unknown, label: string): NormalizedOffer =>
  parseAnswer(NormalizedOfferSchema, value, label);

/** A text within the bounds of the data model, or null when there is nothing to keep. */
export const clamp = (value: string | null | undefined, maxLength: number): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, maxLength);
};

/** The date an ATS gives, or null when it gives none or gives something that is not one. */
export const dateOf = (value: string | number | null | undefined): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
