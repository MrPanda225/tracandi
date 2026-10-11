import { experienceLevel } from '../../db/schema.js';
import { idParam } from '../../lib/ids.js';
import { z } from '../../lib/openapi.js';
import { CriteriaTargetSchema } from '../criteria/schemas.js';

/** EF-VEI-48: how many offers a candidate chooses for each level, and the bounds of the text they paste. */
export const CHOSEN_OFFERS_PER_LEVEL = 3;
export const OFFER_TEXT_MIN_LENGTH = 200;
export const OFFER_TEXT_MAX_LENGTH = 20_000;
const MAX_YEARS = 50;

const LevelSchema = z.enum(experienceLevel.enumValues);

/** EF-VEI-48: the text of the offer as pasted, and the level it is chosen for. Never kept (ENF-RGP-14). */
export const ChooseOfferBodySchema = z
  .object({
    level: LevelSchema,
    text: z
      .string()
      .trim()
      .min(OFFER_TEXT_MIN_LENGTH, 'L’offre semble incomplète : collez le texte entier de l’annonce.')
      .max(OFFER_TEXT_MAX_LENGTH, 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.')
      .openapi({
        description: 'Le texte complet de l’offre, de 200 à 20 000 caractères. Il n’est pas conservé.',
      }),
  })
  .strict()
  .openapi('ChosenOfferChoice');

/** EF-VEI-49: what the candidate corrects of the traits; the years may be null — the offer demands none. */
export const UpdateChosenOfferBodySchema = z
  .object({
    title: CriteriaTargetSchema.shape.label.optional(),
    keywords: CriteriaTargetSchema.shape.keywords.optional(),
    years: z.number().int().min(0).max(MAX_YEARS).nullable().optional(),
    level: LevelSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'Indiquez au moins un trait à corriger.' })
  .openapi('ChosenOfferCorrection');

export const ChosenOfferIdParamsSchema = z.object({ id: idParam() });

/** What is kept of a chosen offer, and all of it (ENF-RGP-14): its traits, never its text. */
export const ChosenOfferSchema = z
  .object({
    id: z.number().int(),
    level: LevelSchema,
    title: z.string(),
    keywords: z.array(z.string()),
    /** RG-29: the years the offer demands, read by the code; null when it states none. */
    years: z.number().int().nullable(),
    /** RG-28: the level the traits point to — by the years, by the title otherwise, null when neither tells. */
    suggestedLevel: LevelSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('ChosenOffer');

export const ChosenOfferListSchema = z
  .object({ items: z.array(ChosenOfferSchema), maxPerLevel: z.number().int() })
  .openapi('ChosenOfferList');

export type ChooseOfferBody = z.infer<typeof ChooseOfferBodySchema>;
export type UpdateChosenOfferBody = z.infer<typeof UpdateChosenOfferBodySchema>;
export type ChosenOfferView = z.infer<typeof ChosenOfferSchema>;
