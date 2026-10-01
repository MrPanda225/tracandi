import { z } from 'zod';
import type { WatchCriteria } from '../../modules/criteria/schemas.js';
import type { LaBonneAlternanceApi } from '../official/laBonneAlternance.js';
import { CRITERIA_IDENTIFIER } from './franceTravail.js';
import {
  clamp,
  dateOf,
  DESCRIPTION_MAX_LENGTH,
  EMPLOYER_NAME_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  NormalizedOfferSchema,
  type NormalizedOffer,
  type OfficialSourceDeps,
  sirenOf,
  type SourceAdapter,
  SourceFetchError,
  TITLE_MAX_LENGTH,
  URL_MAX_LENGTH,
} from './types.js';

/** The radius the API accepts, in km. */
const MAX_RADIUS_KM = 200;
const ACTIVE = 'Active';
/** EF-VEI-33, §5.2: the same exclusions as for France Travail, on the partner and on the address to apply. */
const EXCLUDED = /linkedin|indeed|welcome\s*to\s*the\s*jungle|welcometothejungle|wttj|welcome\s*kit/iu;

const JobSchema = z.object({
  identifier: z.object({
    id: z.string().nullish(),
    partner_label: z.string(),
    partner_job_id: z.string(),
  }),
  workplace: z
    .object({
      name: z.string().nullish(),
      brand: z.string().nullish(),
      legal_name: z.string().nullish(),
      siret: z.string().nullish(),
      location: z.object({ address: z.string().nullish() }).nullish(),
    })
    .nullish(),
  // ENF-RGP-09: only the address to apply is read; `phone` and `recipient_id` never are.
  apply: z.object({ url: z.string() }),
  offer: z.object({
    title: z.string(),
    description: z.string().nullish(),
    desired_skills: z.array(z.string()).nullish(),
    publication: z.object({ creation: z.string().nullish() }).nullish(),
    status: z.string().nullish(),
  }),
});

type Job = z.infer<typeof JobSchema>;

const descriptionOf = (job: Job): string | null => {
  const skills = job.offer.desired_skills ?? [];
  const parts = [
    job.offer.description,
    skills.length > 0 ? `Compétences attendues : ${skills.join(', ')}` : null,
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.length === 0 ? null : clamp(parts.join('\n\n'), DESCRIPTION_MAX_LENGTH);
};

const isExcluded = (job: Job): boolean =>
  EXCLUDED.test(job.identifier.partner_label) || EXCLUDED.test(job.apply.url);

/** The offer's own identifier, or its partner and the partner's identifier: stable between two checks (EF-VEI-09). */
const externalIdOf = (job: Job): string =>
  job.identifier.id ?? `${job.identifier.partner_label}:${job.identifier.partner_job_id}`;

/** The name a candidate knows the employer by: its brand, then its usual name, then its legal name. */
const employerOf = (job: Job): string | null => {
  const workplace = job.workplace;
  return clamp(workplace?.brand ?? workplace?.name ?? workplace?.legal_name, EMPLOYER_NAME_MAX_LENGTH);
};

const locationOf = (job: Job): string | null => clamp(job.workplace?.location?.address, LOCATION_MAX_LENGTH);

const isOpen = (job: Job): boolean => (job.offer.status ?? ACTIVE) === ACTIVE;

/** One offer as the watch stores it, or null when it is closed, excluded or unusable. */
const toOffer = (raw: unknown): NormalizedOffer | null => {
  const read = JobSchema.safeParse(raw);
  if (!read.success || isExcluded(read.data) || !isOpen(read.data)) return null;
  const job = read.data;
  const offer = NormalizedOfferSchema.safeParse({
    externalId: externalIdOf(job),
    title: clamp(job.offer.title, TITLE_MAX_LENGTH) ?? '',
    location: locationOf(job),
    // EF-VEI-21: every offer of La bonne alternance is a work-study contract.
    contractType: 'alternance',
    url: clamp(job.apply.url, URL_MAX_LENGTH) ?? '',
    description: descriptionOf(job),
    postedAt: dateOf(job.offer.publication?.creation),
    employerName: employerOf(job),
    employerSiren: sirenOf(job.workplace?.siret),
  });
  return offer.success ? offer.data : null;
};

/**
 * EF-VEI-34: a candidate asks La bonne alternance only when one of their targets accepts work-study, and with at
 * least one ROME code: the API searches by trade.
 * @returns the reason the source cannot be used with these criteria, or null when it can.
 */
export const workStudyRefusalOf = (criteria: WatchCriteria | null): string | null => {
  if (!criteria)
    return 'Renseignez vos critères de recherche : La bonne alternance est interrogée selon eux.';
  if (!criteria.targets.some((target) => target.contractTypes.includes('alternance'))) {
    return 'Aucune de vos cibles n’accepte l’alternance : La bonne alternance ne publie que des offres en alternance.';
  }
  if (criteria.romeCodes.length === 0) {
    return 'Ajoutez au moins un code ROME à vos critères : La bonne alternance cherche par métier.';
  }
  return null;
};

/**
 * EF-VEI-34, ENF-RGP-11: the query — the ROME codes, and the commune and its radius when there is one. Nothing else
 * of the candidate leaves the server.
 */
export const workStudyQueryOf = (criteria: WatchCriteria): Record<string, string> => ({
  romes: criteria.romeCodes.join(','),
  ...(criteria.place
    ? {
        latitude: String(criteria.place.latitude),
        longitude: String(criteria.place.longitude),
        radius: String(Math.min(criteria.radiusKm, MAX_RADIUS_KM)),
      }
    : {}),
});

const apiOf = (
  deps: OfficialSourceDeps | undefined,
): { api: LaBonneAlternanceApi; criteria: WatchCriteria } => {
  if (!deps?.laBonneAlternance) {
    throw new SourceFetchError('Clé La bonne alternance non configurée sur le serveur (LBA_API_KEY).');
  }
  const refusal = workStudyRefusalOf(deps.criteria);
  if (refusal !== null || !deps.criteria)
    throw new SourceFetchError(refusal ?? 'Critères de recherche absents.');
  return { api: deps.laBonneAlternance, criteria: deps.criteria };
};

/**
 * La bonne alternance, API Apprentissage (EF-VEI-34): work-study offers of every employer, with their SIRET, queried
 * with the criteria; closed offers, excluded partners and recruiter phones left out.
 * @req EF-VEI-08, EF-VEI-34, EF-VEI-37, ENF-RGP-09, ENF-RGP-11
 */
export const laBonneAlternanceAdapter: SourceAdapter = {
  id: 'la_bonne_alternance',
  label: 'La bonne alternance',
  isOfficial: true,
  refusalFor: workStudyRefusalOf,
  identifierHint: 'Rien à saisir : la source est interrogée selon vos critères de recherche.',
  identifierSchema: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === CRITERIA_IDENTIFIER, `Identifiant attendu : « ${CRITERIA_IDENTIFIER} ».`),
  async fetchOffers(_identifier, deps) {
    const { api, criteria } = apiOf(deps.official);
    const offers = new Map<string, NormalizedOffer>();
    for (const offer of (await api.search(workStudyQueryOf(criteria))).map(toOffer)) {
      if (offer) offers.set(offer.externalId, offer);
    }
    return [...offers.values()];
  },
};
