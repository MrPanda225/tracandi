import { contractType, offerStatus, siteAdapter } from '../../db/schema.js';
import { idParam } from '../../lib/ids.js';
import { z } from '../../lib/openapi.js';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_SCORE = 100;

/**
 * EF-VEI-18: what the screen shows at once — the offers still to look at and those the candidate kept. The others
 * are reached by name.
 */
export const OFFER_VIEWS = ['active', 'saved', 'dismissed', 'applied'] as const;

/** EF-VEI-16, EF-VEI-17, EF-VEI-22: one page of offers, best score first. @req ENF-SEC-04 */
export const OfferQuerySchema = z.object({
  view: z.enum(OFFER_VIEWS).default('active'),
  minScore: z.coerce.number().int().min(0).max(MAX_SCORE).optional(),
  contractType: z.enum(contractType.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export const OfferIdSchema = z.object({ id: idParam() });

/** EF-VEI-18: the states the candidate sets by hand; « postulée » only comes from EF-VEI-19. */
export const UpdateOfferSchema = z
  .object({ status: z.enum(['new', 'saved', 'dismissed']) })
  .openapi('UpdateOffer');

/** One offer as the list shows it; its text is read in its detail only. */
export const OfferViewSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    companyName: z.string(),
    location: z.string().nullable(),
    contractType: z.enum(contractType.enumValues),
    url: z.string(),
    postedAt: z.string().datetime().nullable(),
    firstSeenAt: z.string().datetime(),
    relevanceScore: z.number().int().nullable(),
    relevanceReason: z.string().nullable(),
    matchedTarget: z.string().nullable(),
    status: z.enum(offerStatus.enumValues),
    source: z.object({ adapter: z.enum(siteAdapter.enumValues), label: z.string() }),
    /** EF-VEI-20: the application created when the candidate declared having applied. */
    applicationId: z.number().int().nullable(),
    /** EF-VEI-35: the employer is a company of the candidate's applications (same SIREN, or same RG-26 key). */
    isFromAppliedCompany: z.boolean(),
  })
  .openapi('Offer');

export const OfferDetailSchema = OfferViewSchema.extend({ description: z.string().nullable() }).openapi(
  'OfferDetail',
);

export const OfferListSchema = z
  .object({ items: z.array(OfferViewSchema), total: z.number().int() })
  .openapi('OfferList');

export const AppliedOfferSchema = z
  .object({ offer: OfferViewSchema, applicationId: z.number().int() })
  .openapi('AppliedOffer');

export type OfferQuery = z.infer<typeof OfferQuerySchema>;
export type OfferView = z.infer<typeof OfferViewSchema>;
export type OfferDetail = z.infer<typeof OfferDetailSchema>;
export type UpdateOfferBody = z.infer<typeof UpdateOfferSchema>;
