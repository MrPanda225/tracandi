import { z } from 'zod';

/**
 * EF-VEI-28 : bornes du parcours d'un JSON embarqué. Un état d'application monopage est profond et large ; sans
 * ces bornes, une page hostile ou simplement volumineuse ferait tourner le serveur pour rien.
 */
const MAX_DEPTH = 12;
const MAX_NODES = 20_000;
const MAX_JOBS = 60;

const JOB_POSTING = 'jobposting';

/** Le type d'un nœud balisé, que `schema.org` autorise en chaîne ou en liste. */
const typeOf = (node: Record<string, unknown>): string[] => {
  const declared = node['@type'];
  const values = Array.isArray(declared) ? declared : [declared];
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
};

const isJobPosting = (node: Record<string, unknown>): boolean => typeOf(node).includes(JOB_POSTING);

/**
 * Tous les nœuds `JobPosting` d'un JSON, où qu'ils soient : à la racine, dans un `@graph`, dans une liste, ou
 * au fond de l'état embarqué d'une page. Le parcours est borné en profondeur et en nombre de nœuds.
 */
const collectJobPostings = (root: unknown): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = [];
  let visited = 0;

  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH || visited >= MAX_NODES || found.length >= MAX_JOBS) return;
    visited += 1;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (isJobPosting(record)) found.push(record);
    for (const value of Object.values(record)) walk(value, depth + 1);
  };

  walk(root, 0);
  return found;
};

/** Ce qu'on lit d'un lieu balisé : `schema.org` l'écrit en objet, en liste, ou en simple chaîne. */
const PlaceSchema = z.object({
  address: z
    .union([
      z.string(),
      z.object({
        addressLocality: z.string().nullish(),
        addressRegion: z.string().nullish(),
        addressCountry: z.union([z.string(), z.object({ name: z.string().nullish() })]).nullish(),
      }),
    ])
    .nullish(),
  name: z.string().nullish(),
});

/**
 * Une offre balisée, telle que `schema.org/JobPosting` la décrit. Tout y est facultatif sauf l'intitulé : le
 * balisage d'un site réel est souvent incomplet, et une offre sans titre n'est pas une offre.
 * @req EF-VEI-28, EF-IA-03
 */
export const JobPostingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().nullish(),
  datePosted: z.string().nullish(),
  employmentType: z.union([z.string(), z.array(z.string())]).nullish(),
  url: z.string().nullish(),
  '@id': z.string().nullish(),
  identifier: z
    .union([z.string(), z.number(), z.object({ value: z.union([z.string(), z.number()]).nullish() })])
    .nullish(),
  jobLocation: z.union([PlaceSchema, z.array(PlaceSchema)]).nullish(),
  jobLocationType: z.string().nullish(),
  hiringOrganization: z.union([z.string(), z.object({ name: z.string().nullish() })]).nullish(),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;

/** Le lieu qu'une offre balisée désigne, en une ligne lisible, ou null quand elle n'en désigne aucun. */
export const placeOf = (posting: JobPosting): string | null => {
  const places =
    posting.jobLocation === null || posting.jobLocation === undefined
      ? []
      : Array.isArray(posting.jobLocation)
        ? posting.jobLocation
        : [posting.jobLocation];

  for (const place of places) {
    if (typeof place.address === 'string' && place.address.trim() !== '') return place.address.trim();
    if (place.address && typeof place.address === 'object') {
      const parts = [place.address.addressLocality, place.address.addressRegion].filter(
        (part): part is string => typeof part === 'string' && part.trim() !== '',
      );
      if (parts.length > 0) return parts.join(', ');
    }
    if (typeof place.name === 'string' && place.name.trim() !== '') return place.name.trim();
  }
  // `TELECOMMUTE` est la façon dont schema.org dit qu'un poste se tient à distance.
  return posting.jobLocationType?.toUpperCase() === 'TELECOMMUTE' ? 'Télétravail' : null;
};

/** Le contrat que l'offre déclare, en une chaîne, quel que soit le nombre de valeurs balisées. */
export const employmentOf = (posting: JobPosting): string | null => {
  const declared = posting.employmentType;
  if (typeof declared === 'string') return declared;
  return Array.isArray(declared) ? (declared.find((value) => value.trim() !== '') ?? null) : null;
};

/** L'adresse que l'offre déclare — `url` d'abord, puis `@id` —, sans la valider : c'est au code appelant. */
export const addressOf = (posting: JobPosting): string | null => posting.url ?? posting['@id'] ?? null;

/** L'identifiant que la source donne à l'offre, quand elle en donne un (EF-VEI-09). */
export const identifierOf = (posting: JobPosting): string | null => {
  const declared = posting.identifier;
  if (typeof declared === 'string' || typeof declared === 'number') return String(declared);
  const value = declared?.value;
  return value === null || value === undefined ? null : String(value);
};

/**
 * EF-VEI-28 : les offres qu'une page publie sous forme balisée, lues sans aucun appel d'IA.
 *
 * Chaque bloc est analysé isolément : un JSON mal formé — il y en a beaucoup dans la nature — est ignoré, pas
 * une raison de perdre les autres. Ce qui ne correspond pas au schéma est écarté de même, offre par offre.
 *
 * Les valeurs rendues sont **du contenu non fiable** : c'est au code appelant de borner les longueurs et de
 * vérifier les adresses contre le site de la source (rules/security.md).
 * @req EF-VEI-28, ENF-SEC-06
 */
export const readStructuredJobs = (jsonBlocks: readonly string[]): JobPosting[] => {
  const postings: JobPosting[] = [];
  for (const block of jsonBlocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }
    for (const node of collectJobPostings(parsed)) {
      const read = JobPostingSchema.safeParse(node);
      if (read.success) postings.push(read.data);
      if (postings.length >= MAX_JOBS) return postings;
    }
  }
  return postings;
};
