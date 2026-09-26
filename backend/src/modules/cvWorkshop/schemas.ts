import { z } from '../../lib/openapi.js';

/** EF-CVX-21: the imported CV, as the interface sends it — the PDF file in base64, inside a JSON body. */
export const StartAnalysisBodySchema = z
  .object({ file: z.string().min(1).openapi({ description: 'Le CV au format PDF, encodé en base64 (5 Mo au plus).' }) })
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

/** What the analysis read: the text the AI will receive, and the contact details kept aside (ENF-RGP-07). */
export const CvAnalysisSchema = z
  .object({
    reading: z.object({ text: z.string(), contacts: CvContactsSchema, ocrPageCount: z.number().int() }),
  })
  .openapi('CvAnalysis');

export const StartedAnalysisSchema = z.object({ runId: z.number().int() }).openapi('CvAnalysisStarted');
