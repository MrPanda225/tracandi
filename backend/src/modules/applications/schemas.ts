import {
  applicationSource,
  applicationStatus,
  contractType,
  emailCategory,
  emailDirection,
} from '../../db/schema.js';
import { z } from '../../lib/openapi.js';
import { normalizeKey } from '../../lib/text.js';

const LIST_DEFAULT_LIMIT = 100;
const LIST_MAX_LIMIT = 500;
const NOTES_MAX_LENGTH = 2000;
const SEARCH_MAX_LENGTH = 100;

const hasLettersOrDigits = (value: string) => normalizeKey(value).length > 0;

export const ApplicationStatusSchema = z.enum(applicationStatus.enumValues).openapi('ApplicationStatus', {
  description:
    'RG-01 : to_apply = À postuler, sent = Envoyée, acknowledged = Accusé reçu, interview = Entretien, ' +
    'offer = Proposition, rejected = Refusée.',
});

export const ContractTypeSchema = z.enum(contractType.enumValues).openapi('ContractType', {
  description: 'Glossaire v1.1 : cdi, cdd, alternance, job_etudiant, autre, non_precise.',
});

const CompanyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(hasLettersOrDigits, 'Doit contenir au moins une lettre ou un chiffre')
  .openapi({ example: "McDonald's" });

const JobTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .refine(hasLettersOrDigits, 'Doit contenir au moins une lettre ou un chiffre')
  .openapi({ example: 'Équipier polyvalent' });

export const IdParamsSchema = z.object({ id: z.coerce.number().int().positive().openapi({ example: 1 }) });

/** EF-CAN-02, EF-CAN-03, EF-CAN-14 */
export const ListApplicationsQuerySchema = z
  .object({
    status: ApplicationStatusSchema.optional(),
    contractType: ContractTypeSchema.optional(),
    q: z
      .string()
      .trim()
      .max(SEARCH_MAX_LENGTH)
      .optional()
      .openapi({
        description: "Recherche dans le nom de l'entreprise ou l'intitulé (EF-CAN-03)",
        example: 'mcdo',
      }),
    limit: z.coerce.number().int().min(1).max(LIST_MAX_LIMIT).default(LIST_DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/** EF-CAN-06, EF-CAN-08, EF-CAN-13 */
export const CreateApplicationBodySchema = z
  .object({
    companyName: CompanyNameSchema,
    jobTitle: JobTitleSchema,
    status: ApplicationStatusSchema,
    contractType: ContractTypeSchema.default('non_precise'),
    notes: z.string().max(NOTES_MAX_LENGTH).optional(),
  })
  .strict()
  .openapi('CreateApplicationBody');

/** EF-CAN-07, EF-CAN-08, EF-CAN-13 */
export const UpdateApplicationBodySchema = z
  .object({
    status: ApplicationStatusSchema.optional(),
    contractType: ContractTypeSchema.optional(),
    jobTitle: JobTitleSchema.optional(),
    notes: z.string().max(NOTES_MAX_LENGTH).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Au moins un champ à modifier')
  .openapi('UpdateApplicationBody');

/** EF-CAN-10 */
export const ReattachEmailBodySchema = z
  .object({
    applicationId: z
      .number()
      .int()
      .positive()
      .nullable()
      .openapi({ description: 'Candidature cible, ou null pour détacher le message' }),
  })
  .strict()
  .openapi('ReattachEmailBody');

const DateTimeSchema = z.string().datetime().openapi({ example: '2026-09-22T08:00:00.000Z' });

export const ApplicationSchema = z
  .object({
    id: z.number().int(),
    company: z.object({ id: z.number().int(), name: z.string() }),
    jobTitle: z.string(),
    contractType: ContractTypeSchema,
    status: ApplicationStatusSchema,
    source: z.enum(applicationSource.enumValues),
    platform: z.string().nullable().openapi({ description: 'Plateforme intermédiaire (EF-GML-10)' }),
    notes: z.string().nullable(),
    appliedAt: DateTimeSchema,
    lastActivityAt: DateTimeSchema,
    isFollowUpDue: z.boolean().openapi({ description: 'À relancer (RG-06, EF-CAN-12)' }),
  })
  .openapi('Application');

export const ApplicationListSchema = z
  .object({ items: z.array(ApplicationSchema), total: z.number().int() })
  .openapi('ApplicationList');

export const EmailSchema = z
  .object({
    id: z.number().int(),
    direction: z.enum(emailDirection.enumValues),
    category: z.enum(emailCategory.enumValues),
    fromAddress: z.string().nullable(),
    subject: z.string().nullable(),
    snippet: z.string().nullable().openapi({ description: 'Extrait de 300 caractères au plus (ENF-RGP-01)' }),
    platform: z.string().nullable(),
    receivedAt: DateTimeSchema,
    gmailUrl: z.string().url().openapi({ description: 'Ouvre le fil dans Gmail (EF-CAN-05)' }),
  })
  .openapi('Email');

export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;
export type CreateApplicationBody = z.infer<typeof CreateApplicationBodySchema>;
export type UpdateApplicationBody = z.infer<typeof UpdateApplicationBodySchema>;
export type ApplicationView = Omit<z.infer<typeof ApplicationSchema>, 'appliedAt' | 'lastActivityAt'> & {
  appliedAt: Date;
  lastActivityAt: Date;
};
export type EmailView = Omit<z.infer<typeof EmailSchema>, 'receivedAt'> & { receivedAt: Date };
