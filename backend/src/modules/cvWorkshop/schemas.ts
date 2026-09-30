import { z } from '../../lib/openapi.js';
import { AdaptedCvSchema } from './adaptedCv.js';

// EF-CVX-27: same bounds as the diagnostic's list.
const MISSING_SKILLS_MAX = 20;
const MISSING_SKILL_MAX_LENGTH = 60;

/** EF-CVX-23: bounds of the text of the offer. */
export const OFFER_MIN_LENGTH = 200;
export const OFFER_MAX_LENGTH = 20_000;

/** EF-CVX-21, EF-CVX-23: the PDF in base64 inside a JSON body, and the text of the offer. */
export const StartAnalysisBodySchema = z
  .object({
    file: z.string().min(1).openapi({ description: 'Le CV au format PDF, encodé en base64 (5 Mo au plus).' }),
    offer: z
      .string()
      .trim()
      .min(OFFER_MIN_LENGTH, 'L’offre semble incomplète : collez le texte entier de l’annonce.')
      .max(OFFER_MAX_LENGTH, 'L’offre dépasse 20 000 caractères : gardez l’essentiel de l’annonce.')
      .openapi({ description: 'Le texte complet de l’offre, de 200 à 20 000 caractères.' }),
  })
  .strict()
  .openapi('CvAnalysisRequest');

export const AnalysisIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

const CvContactsSchema = z
  .object({
    name: z.string().nullable(),
    emails: z.array(z.string()),
    phones: z.array(z.string()),
    address: z.string().nullable(),
    links: z.array(z.string()),
  })
  .openapi('CvContacts');

const ExplainedScoreSchema = z.object({ score: z.number().int(), explanation: z.string() });

/**
 * What the analysis read — the text the AI received, and the contact details kept aside (ENF-RGP-07) — and its
 * diagnostic against the offer (EF-CVX-24, EF-CVX-27, EF-CVX-30, RG-23).
 */
export const CvAnalysisSchema = z
  .object({
    reading: z.object({ text: z.string(), contacts: CvContactsSchema, ocrPageCount: z.number().int() }),
    diagnosis: z.object({
      overallScore: z.number().int(),
      dimensions: z.object({
        skills: ExplainedScoreSchema,
        experience: ExplainedScoreSchema,
        education: ExplainedScoreSchema,
        techStack: ExplainedScoreSchema,
      }),
      weakDimensions: z.array(z.enum(['skills', 'experience', 'education', 'techStack'])),
      missingSkills: z.array(z.string()),
    }),
    adapted: z.object({
      cv: AdaptedCvSchema,
      changes: z.array(z.object({ section: z.string(), before: z.string(), after: z.string(), reason: z.string() })),
    }),
  })
  .openapi('CvAnalysis');

/** EF-CVX-28: missing skills the candidate ticked, to add to « Compétences » in the Word file. */
export const DocxRequestSchema = z
  .object({
    addedSkills: z
      .array(z.string().trim().min(1).max(MISSING_SKILL_MAX_LENGTH))
      .max(MISSING_SKILLS_MAX)
      .openapi({ description: 'Compétences manquantes cochées, parmi celles du diagnostic.' }),
  })
  .strict()
  .openapi('CvDocxRequest');

export const StartedAnalysisSchema = z.object({ runId: z.number().int() }).openapi('CvAnalysisStarted');
