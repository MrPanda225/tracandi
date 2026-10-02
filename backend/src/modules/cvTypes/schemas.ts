import { experienceLevel } from '../../db/schema.js';
import { z } from '../../lib/openapi.js';

/** EF-CVX-39: how many CV types a candidate keeps, and how long a label may be. */
export const CV_TYPES_MAX = 4;
export const CV_TYPE_LABEL_MAX_LENGTH = 80;

const FILE_DESCRIPTION = 'Le CV au format PDF, encodé en base64 (5 Mo au plus).';

const LabelSchema = z
  .string()
  .trim()
  .min(1, 'Donnez un libellé à ce CV type.')
  .max(CV_TYPE_LABEL_MAX_LENGTH, 'Le libellé dépasse 80 caractères : gardez l’essentiel.');

/** EF-CVX-39: the PDF in base64 inside a JSON body, like the CV workshop, and the label of the CV type. */
export const ImportCvTypeBodySchema = z
  .object({
    label: LabelSchema.openapi({ description: 'Libellé du CV type, de 1 à 80 caractères.' }),
    file: z.string().min(1).openapi({ description: FILE_DESCRIPTION }),
  })
  .strict()
  .openapi('CvTypeImport');

/** EF-CVX-41: the new file of a CV type; its label stays. */
export const ReplaceCvTypeBodySchema = z
  .object({ file: z.string().min(1).openapi({ description: FILE_DESCRIPTION }) })
  .strict()
  .openapi('CvTypeReplacement');

export const CvTypeIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });

/** What is kept of a CV type, and all of it (ENF-RGP-14): never the file nor its text. */
export const CvTypeSchema = z
  .object({
    id: z.number().int(),
    label: z.string(),
    /** EF-VEI-43: worked out by the code from the periods of the CV; null until the CV was deduced from. */
    years: z.number().int().nullable(),
    level: z.enum(experienceLevel.enumValues).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('CvType');

export const CvTypeListSchema = z
  .object({ items: z.array(CvTypeSchema), maxItems: z.number().int() })
  .openapi('CvTypeList');

export type ImportCvTypeBody = z.infer<typeof ImportCvTypeBodySchema>;
export type ReplaceCvTypeBody = z.infer<typeof ReplaceCvTypeBodySchema>;
export type CvTypeView = z.infer<typeof CvTypeSchema>;
