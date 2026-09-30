import { z } from '../../lib/openapi.js';

/** RG-09: the contracts a target may accept — the four of the glossary the candidate looks for (BES-12). */
export const CRITERIA_CONTRACT_TYPES = ['cdi', 'cdd', 'alternance', 'job_etudiant'] as const;

export const MAX_TARGETS = 5;
export const MAX_KEYWORDS = 15;
export const MAX_ROME_CODES = 10;
export const MIN_RADIUS_KM = 5;
export const MAX_RADIUS_KM = 100;
const LABEL_MAX_LENGTH = 80;
const KEYWORD_MAX_LENGTH = 60;
const PLACE_NAME_MAX_LENGTH = 120;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const label = (max: number) => z.string().trim().min(1).max(max);

/** A list whose values each appear once, whatever their case: the same keyword twice would weigh nothing more. */
const distinct = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .array(item)
    .max(max)
    .transform((values: z.infer<T>[]) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = String(value).toLocaleLowerCase('fr');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

/** EF-VEI-29, RG-09, RG-10: a kind of job the candidate looks for, its keywords and the contracts it accepts. */
export const CriteriaTargetSchema = z.object({
  label: label(LABEL_MAX_LENGTH),
  keywords: distinct(label(KEYWORD_MAX_LENGTH), MAX_KEYWORDS).pipe(z.array(z.string()).min(1)),
  contractTypes: distinct(z.enum(CRITERIA_CONTRACT_TYPES), CRITERIA_CONTRACT_TYPES.length).pipe(
    z.array(z.enum(CRITERIA_CONTRACT_TYPES)).min(1),
  ),
});

/** EF-VEI-30: a commune as the public service describes it (INSEE code, Corsica included). */
export const PlaceSchema = z
  .object({
    code: z.string().regex(/^(\d{5}|2[AB]\d{3})$/u, 'Code INSEE invalide.'),
    name: label(PLACE_NAME_MAX_LENGTH),
    departmentCode: z.string().regex(/^(\d{2,3}|2[AB])$/u, 'Code de département invalide.'),
    latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
    longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  })
  .openapi('Place');

/** ROME 4.0 code: one capital letter and four digits (« M1419 »). */
const RomeCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]\d{4}$/u, 'Code ROME invalide : une lettre et quatre chiffres, par exemple M1419.');

/**
 * EF-VEI-29: what the candidate looks for. No commune means the whole of France; the radius counts around the
 * commune and is kept even without one, so that choosing a commune later needs nothing else.
 * @req EF-VEI-29, ENF-SEC-04
 */
export const WatchCriteriaSchema = z
  .object({
    targets: z.array(CriteriaTargetSchema).min(1).max(MAX_TARGETS),
    place: PlaceSchema.nullable(),
    radiusKm: z.number().int().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM),
    acceptsRemote: z.boolean(),
    romeCodes: distinct(RomeCodeSchema, MAX_ROME_CODES),
  })
  .openapi('WatchCriteria');

export const CriteriaResponseSchema = z
  .object({ criteria: WatchCriteriaSchema.nullable() })
  .openapi('WatchCriteriaResponse');

export const PlaceQuerySchema = z.object({ q: z.string().trim().max(PLACE_NAME_MAX_LENGTH) });

export const PlaceListSchema = z.object({ items: z.array(PlaceSchema) }).openapi('PlaceList');

export type WatchCriteria = z.infer<typeof WatchCriteriaSchema>;
export type CriteriaTarget = z.infer<typeof CriteriaTargetSchema>;
