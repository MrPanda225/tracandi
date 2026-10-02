import { z } from '../../lib/openapi.js';
import { siteAdapter } from '../../db/schema.js';
import { adapterFor } from '../../scraper/adapters/index.js';

const COMPANY_NAME_MAX_LENGTH = 160;
const IDENTIFIER_MAX_LENGTH = 500;
const ERROR_MAX_LENGTH = 500;

/** The six source types of the watch, as the screen offers them (EF-VEI-01, EF-VEI-08). */
export const SOURCE_ADAPTER_IDS = siteAdapter.enumValues;

/**
 * EF-VEI-01, EF-VEI-02: a source is a company, a type and an identifier. The identifier is read by the schema of
 * its own type (RG-08), so a Greenhouse slug and a Workday address are never checked by the same rule.
 * @req EF-VEI-01, EF-VEI-02, ENF-SEC-04
 */
export const CreateSourceSchema = z
  .object({
    /** Required for a company source; ignored for an official one, which has none (EF-VEI-32). */
    companyName: z.string().trim().min(1).max(COMPANY_NAME_MAX_LENGTH).optional(),
    adapter: z.enum(SOURCE_ADAPTER_IDS),
    identifier: z.string().trim().min(1).max(IDENTIFIER_MAX_LENGTH),
  })
  .superRefine((value, context) => {
    if (!adapterFor(value.adapter).isOfficial && value.companyName === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['companyName'],
        message: 'Nom d’entreprise requis.',
      });
    }
    const read = adapterFor(value.adapter).identifierSchema.safeParse(value.identifier);
    if (!read.success) {
      for (const issue of read.error.issues) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['identifier'], message: issue.message });
      }
    }
  })
  .openapi('CreateSource');

/** EF-VEI-04: the only thing a source lets the candidate change once it is watched. */
export const UpdateSourceSchema = z.object({ isActive: z.boolean() }).openapi('UpdateSource');

export const SourceIdSchema = z.object({ id: z.coerce.number().int().positive() });

/** One watched source as the screen shows it (EF-VEI-10, EF-VEI-11). */
export const SourceViewSchema = z
  .object({
    id: z.number().int(),
    /** Null for an official source (EF-VEI-32): the screen names it by its type. */
    companyName: z.string().nullable(),
    adapter: z.enum(SOURCE_ADAPTER_IDS),
    /** Name of the type in French, so the screen never has to hold the list itself. */
    adapterLabel: z.string(),
    identifier: z.string(),
    isActive: z.boolean(),
    lastCheckedAt: z.string().datetime().nullable(),
    lastError: z.string().max(ERROR_MAX_LENGTH).nullable(),
    offerCount: z.number().int(),
  })
  .openapi('Source');

export const SourceListSchema = z.object({ items: z.array(SourceViewSchema) }).openapi('SourceList');

/**
 * EF-VEI-01 : un type de source proposé au candidat. L'écran lit cette liste au lieu de la tenir lui-même, pour
 * qu'ajouter un type reste un fichier et une entrée de registre (ENF-MAI-03).
 */
export const SourceTypeSchema = z
  .object({
    id: z.enum(SOURCE_ADAPTER_IDS),
    label: z.string(),
    /** Ce que le candidat doit saisir, en français (RG-08). */
    identifierHint: z.string(),
    /** EF-VEI-32 : une source officielle, sans entreprise, interrogée selon les critères de recherche. */
    isOfficial: z.boolean(),
  })
  .openapi('SourceType');

export const SourceTypeListSchema = z.object({ items: z.array(SourceTypeSchema) }).openapi('SourceTypeList');

/** EF-VEI-07: what one pass of the watch produced, for the candidate who asked for it. */
/**
 * EF-VEI-23, EF-VEI-24 : une source proposée au candidat, déduite des entreprises auxquelles il a déjà postulé.
 * Elle n'est jamais ajoutée d'office : l'écran la présente pré-remplie, le candidat confirme ou écarte (RG-19).
 */
export const SourceSuggestionSchema = z
  .object({
    companyId: z.number().int(),
    companyName: z.string(),
    /** Le domaine d'où l'entreprise a écrit, retenu par RG-19. */
    domain: z.string(),
    /** Le type proposé : l'ATS reconnu à l'expéditeur, ou la page carrières à défaut (EF-VEI-24). */
    adapter: z.enum(SOURCE_ADAPTER_IDS),
    /** L'identifiant pré-rempli : l'adresse du domaine pour une page carrières, le nom normalisé sinon (RG-08). */
    identifier: z.string(),
    /** Combien de messages de cette entreprise ont porté ce domaine, pour que le candidat juge. */
    messages: z.number().int(),
    /**
     * EF-VEI-39 (v1.33) : ce qu'a conclu la recherche des pages carrières — source vérifiée avec son nombre d'offres,
     * à confirmer, ou rien trouvé ; null tant qu'elle n'a pas été lancée pour cette entreprise.
     */
    verification: z.enum(['verified', 'unconfirmed', 'not_found']).nullable(),
    offerCount: z.number().int().nullable(),
    discoveredAt: z.string().datetime().nullable(),
  })
  .openapi('SourceSuggestion');

export const SourceSuggestionListSchema = z
  .object({ items: z.array(SourceSuggestionSchema) })
  .openapi('SourceSuggestionList');

export const CompanyIdSchema = z.object({ companyId: z.coerce.number().int().positive() });

export const WatchReportSchema = z
  .object({
    sourcesChecked: z.number().int(),
    sourcesFailed: z.number().int(),
    offersFound: z.number().int(),
    offersNew: z.number().int(),
    /** Offers scored at or above the threshold of EF-VEI-15. */
    offersRelevant: z.number().int(),
    /** EF-VEI-54: offers kept but still waiting for a score after this pass. */
    offersUnscored: z.number().int(),
    /** EF-CFG-09: how many calls the pass made to the local model, and to the providers that took over from it. */
    modelCallsLocal: z.number().int(),
    modelCallsFallback: z.number().int(),
    threshold: z.number().int(),
  })
  .openapi('WatchReport');

export type CreateSourceBody = z.infer<typeof CreateSourceSchema>;
export type UpdateSourceBody = z.infer<typeof UpdateSourceSchema>;
export type SourceView = z.infer<typeof SourceViewSchema>;
export type SourceType = z.infer<typeof SourceTypeSchema>;
export type SourceSuggestion = z.infer<typeof SourceSuggestionSchema>;
export type WatchReport = z.infer<typeof WatchReportSchema>;
