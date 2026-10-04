import { z } from 'zod';
import type { CriteriaTarget, WatchCriteria } from '../../modules/criteria/schemas.js';
import type { FranceTravailApi } from '../official/franceTravail.js';
import {
  clamp,
  dateOf,
  DESCRIPTION_MAX_LENGTH,
  EMPLOYER_NAME_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  NormalizedOfferSchema,
  type NormalizedOffer,
  type OfferContractType,
  type OfficialSourceDeps,
  type SourceAdapter,
  sirenOf,
  SourceFetchError,
  TITLE_MAX_LENGTH,
} from './types.js';

/** RG-08 (v1.33): an official source has no identifier of its own; this fixed value stands for « my criteria ». */
export const CRITERIA_IDENTIFIER = 'criteres';
const DETAIL_URL = 'https://candidat.francetravail.fr/offres/recherche/detail/';
/** The periods the API accepts for `publieeDepuis`, in days. */
const PUBLISHED_SINCE_DAYS = [1, 3, 7, 14, 31] as const;
const LONGEST_PERIOD_DAYS = 31;
/** First check: a week of offers, not a month — a month would be scored at once (ENF-COU-01). */
const FIRST_CHECK_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** One page per query, the most recent first; the API gives 150 at most. */
const PAGE = '0-149';
const MOST_RECENT_FIRST = '1';
/** ENF-COU-01: bounds of one check, whatever the criteria. */
const MAX_QUERIES = 12;
const MAX_OFFERS = 300;
/** EF-VEI-33, §5.2: partners whose offers are never kept, even relayed by France Travail. */
const EXCLUDED_PARTNERS = /linkedin|indeed|welcome\s*to\s*the\s*jungle|wttj|welcome\s*kit/iu;
/** Contract codes of the API that the glossary names; every other one (interim, seasonal…) is « autre ». */
const CONTRACT_CODES: Readonly<Record<string, OfferContractType>> = { CDI: 'cdi', CDD: 'cdd' };
const WORK_STUDY = /apprentissage|professionnalisation/iu;

const ResultSchema = z.object({
  id: z.string().min(1),
  intitule: z.string().min(1),
  description: z.string().nullish(),
  dateCreation: z.string().nullish(),
  lieuTravail: z.object({ libelle: z.string().nullish() }).nullish(),
  entreprise: z.object({ nom: z.string().nullish(), siret: z.string().nullish() }).nullish(),
  typeContrat: z.string().nullish(),
  natureContrat: z.string().nullish(),
  alternance: z.boolean().nullish(),
  experienceLibelle: z.string().nullish(),
  salaire: z.union([z.object({ libelle: z.string().nullish() }), z.array(z.unknown())]).nullish(),
  origineOffre: z
    .object({ partenaires: z.array(z.object({ nom: z.string().nullish() })).nullish() })
    .nullish(),
  // ENF-RGP-09: `contact` is never declared, so never read — zod leaves it out of what it returns.
});

type Result = z.infer<typeof ResultSchema>;

/**
 * EF-VEI-32: the value of `publieeDepuis` covering the time since the previous check — the smallest period the API
 * offers that is at least as long, 31 days at most; a week before the first check.
 */
export const publishedSinceDays = (since: Date | null, now: Date): number => {
  if (since === null) return FIRST_CHECK_DAYS;
  const elapsed = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / MS_PER_DAY));
  return PUBLISHED_SINCE_DAYS.find((days) => days >= elapsed) ?? LONGEST_PERIOD_DAYS;
};

/** The contract filters of a target, one per kind of query: the API cannot ask for a CDI and an apprenticeship at once. */
const contractFiltersOf = (target: CriteriaTarget): Record<string, string>[] => {
  const codes = target.contractTypes.flatMap((contract) =>
    contract === 'cdi' ? ['CDI'] : contract === 'cdd' ? ['CDD'] : [],
  );
  return [
    ...(codes.length > 0 ? [{ typeContrat: codes.join(',') }] : []),
    ...(target.contractTypes.includes('alternance') ? [{ natureContrat: 'E2,FS' }] : []),
    ...(target.contractTypes.includes('job_etudiant') ? [{ tempsPlein: 'false' }] : []),
  ];
};

/**
 * EF-VEI-32, ENF-RGP-11: the queries a check sends — for each target, its job title under each kind of contract it
 * accepts, and the ROME codes once per kind of contract. Only criteria leave the server: never a name, an address
 * or anything else of the candidate.
 * @req EF-VEI-32, ENF-RGP-11
 */
export const queriesFor = (criteria: WatchCriteria, days: number): Record<string, string>[] => {
  const common: Record<string, string> = {
    publieeDepuis: String(days),
    sort: MOST_RECENT_FIRST,
    range: PAGE,
    ...(criteria.place ? { commune: criteria.place.code, distance: String(criteria.radiusKm) } : {}),
  };
  const byTarget = criteria.targets.flatMap((target) =>
    contractFiltersOf(target).map((filter) => ({ ...common, ...filter, motsCles: target.label })),
  );
  const filters = [
    ...new Map(
      criteria.targets.flatMap(contractFiltersOf).map((filter) => [JSON.stringify(filter), filter]),
    ).values(),
  ];
  const byRome =
    criteria.romeCodes.length === 0
      ? []
      : filters.map((filter) => ({ ...common, ...filter, codeROME: criteria.romeCodes.join(',') }));
  return [...byRome, ...byTarget].slice(0, MAX_QUERIES);
};

const contractOf = (result: Result): OfferContractType => {
  if (result.alternance === true || WORK_STUDY.test(result.natureContrat ?? '')) return 'alternance';
  if (!result.typeContrat) return 'non_precise';
  return CONTRACT_CODES[result.typeContrat.toUpperCase()] ?? 'autre';
};

/** The text of the offer, with what RG-09 weighs and the list does not show: experience and salary. */
const descriptionOf = (result: Result): string | null => {
  const salary = Array.isArray(result.salaire) ? null : result.salaire?.libelle;
  const parts = [
    result.description,
    result.experienceLibelle ? `Expérience : ${result.experienceLibelle}` : null,
    salary ? `Salaire : ${salary}` : null,
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.length === 0 ? null : clamp(parts.join('\n\n'), DESCRIPTION_MAX_LENGTH);
};

const isExcluded = (result: Result): boolean =>
  (result.origineOffre?.partenaires ?? []).some((partner) => EXCLUDED_PARTNERS.test(partner.nom ?? ''));

/** One result as the watch stores it, or null when it is not a usable offer: one bad result never costs the others. */
const toOffer = (raw: unknown): NormalizedOffer | null => {
  const read = ResultSchema.safeParse(raw);
  if (!read.success || isExcluded(read.data)) return null;
  const result = read.data;
  const offer = NormalizedOfferSchema.safeParse({
    externalId: result.id,
    title: clamp(result.intitule, TITLE_MAX_LENGTH) ?? '',
    location: clamp(result.lieuTravail?.libelle, LOCATION_MAX_LENGTH),
    contractType: contractOf(result),
    // The offer on francetravail.fr: its source, as the reuse licence asks, whatever partner published it first.
    url: `${DETAIL_URL}${encodeURIComponent(result.id)}`,
    description: descriptionOf(result),
    postedAt: dateOf(result.dateCreation),
    employerName: clamp(result.entreprise?.nom, EMPLOYER_NAME_MAX_LENGTH),
    employerSiren: sirenOf(result.entreprise?.siret),
  });
  return offer.success ? offer.data : null;
};

const officialOf = (
  deps: OfficialSourceDeps | undefined,
): { criteria: WatchCriteria; since: Date | null; now: Date; api: FranceTravailApi } => {
  if (!deps?.franceTravail) {
    throw new SourceFetchError(
      'Identifiants France Travail non configurés sur le serveur (FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET).',
    );
  }
  if (!deps.criteria) {
    throw new SourceFetchError(
      'Renseignez vos critères de recherche : France Travail est interrogé selon eux.',
    );
  }
  return { criteria: deps.criteria, since: deps.since, now: deps.now, api: deps.franceTravail };
};

/**
 * France Travail, API « Offres d'emploi v2 » (EF-VEI-32): one source per candidate, queried with their criteria,
 * offers of every employer, partners excluded by §5.2 left out (EF-VEI-33), contacts never read (ENF-RGP-09).
 * @req EF-VEI-08, EF-VEI-32, EF-VEI-33, EF-VEI-37, ENF-RGP-09, ENF-RGP-11
 */
export const franceTravailAdapter: SourceAdapter = {
  id: 'france_travail',
  label: 'France Travail',
  isOfficial: true,
  identifierHint: 'Rien à saisir : la source est interrogée selon vos critères de recherche.',
  identifierSchema: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === CRITERIA_IDENTIFIER, `Identifiant attendu : « ${CRITERIA_IDENTIFIER} ».`),
  async fetchOffers(_identifier, deps) {
    const { criteria, since, now, api } = officialOf(deps.official);
    const days = publishedSinceDays(since, now);
    const offers = new Map<string, NormalizedOffer>();
    // One query after the other: the client already paces them (ENF-COL-05), and a check stops at its bound.
    for (const query of queriesFor(criteria, days)) {
      if (offers.size >= MAX_OFFERS) break;
      for (const offer of (await api.search(query)).map(toOffer)) {
        if (offer && offers.size < MAX_OFFERS) offers.set(offer.externalId, offer);
      }
    }
    return [...offers.values()];
  },
};
