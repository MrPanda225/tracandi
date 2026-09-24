import { z } from '../../lib/openapi.js';
import { ApplicationStatusSchema, ContractTypeSchema } from '../applications/schemas.js';

const CountSchema = z.number().int().min(0);
const RateSchema = z.number().int().min(0).max(100).openapi({ description: 'Pourcentage entier (RG-07)' });
const DateTimeSchema = z.string().datetime().openapi({ example: '2026-09-21T00:00:00.000Z' });

export const DashboardSchema = z
  .object({
    totals: z.object({
      applications: CountSchema.openapi({ description: 'EF-TDB-01' }),
      reachedInterview: CountSchema.openapi({
        description: 'EF-TDB-02 : candidatures passées par Entretien ou Proposition (historique des statuts)',
      }),
      responseRate: RateSchema.openapi({ description: 'EF-TDB-03, RG-07' }),
    }),
    byStatus: z
      .array(z.object({ status: ApplicationStatusSchema, count: CountSchema }))
      .openapi({ description: 'EF-TDB-05 : chaque statut de RG-01, dans son ordre' }),
    byChannel: z
      .object({ direct: CountSchema, platform: CountSchema })
      .openapi({ description: 'EF-TDB-06 : sans plateforme intermédiaire (direct) ou via une plateforme' }),
    byContractType: z
      .array(z.object({ contractType: ContractTypeSchema, count: CountSchema, responseRate: RateSchema }))
      .openapi({ description: 'EF-TDB-09 : chaque type de contrat, dans son ordre' }),
    weekly: z
      .array(
        z.object({
          weekStart: DateTimeSchema.openapi({ description: 'Lundi 00:00 UTC' }),
          sent: CountSchema,
          interviews: CountSchema,
          rejected: CountSchema,
        }),
      )
      .openapi({
        description:
          'EF-TDB-04 : les 5 dernières semaines, semaine en cours comprise, la plus ancienne en premier',
      }),
    followUps: z
      .object({
        total: CountSchema,
        items: z.array(
          z.object({
            id: z.number().int(),
            company: z.string(),
            jobTitle: z.string(),
            status: ApplicationStatusSchema,
            lastActivityAt: DateTimeSchema,
            daysSinceActivity: CountSchema,
          }),
        ),
      })
      .openapi({
        description: 'EF-TDB-07 : à relancer (RG-06), la plus ancienne en premier ; 20 au plus dans `items`',
      }),
    offers: z
      .object({ newAboveThreshold: CountSchema, threshold: RateSchema.openapi({ description: 'Seuil S' }) })
      .nullable()
      .openapi({
        description:
          'EF-TDB-08 : offres « nouvelles » de score ≥ S ; null si la veille est désactivée (ENF-MAI-07)',
      }),
    followUpDays: z.number().int().min(1).openapi({ description: 'Délai de relance D (RG-06)' }),
  })
  .openapi('Dashboard');

type DashboardJson = z.infer<typeof DashboardSchema>;
type FollowUpJson = DashboardJson['followUps']['items'][number];

/** Dashboard as built by the service (dates as `Date`, serialized to ISO strings by Express). */
export type DashboardView = Omit<DashboardJson, 'weekly' | 'followUps'> & {
  weekly: (Omit<DashboardJson['weekly'][number], 'weekStart'> & { weekStart: Date })[];
  followUps: {
    total: number;
    items: (Omit<FollowUpJson, 'lastActivityAt'> & { lastActivityAt: Date })[];
  };
};
