import { z } from '../../lib/openapi.js';

const DateTimeSchema = z.string().datetime().openapi({ example: '2026-09-22T08:00:00.000Z' });

/** Google's redirection parameters; other parameters sent by Google (scope, authuser…) are ignored. */
export const AuthorizationAnswerQuerySchema = z.object({
  code: z.string().max(2048).optional(),
  state: z
    .string()
    .max(128)
    .optional()
    .openapi({ description: 'State émis avec l’URL de consentement (ENF-SEC-14)' }),
  error: z
    .string()
    .max(200)
    .optional()
    .openapi({ description: 'Refus de l’utilisateur sur la page de Google' }),
});

export const AuthorizationUrlSchema = z
  .object({
    url: z.string().url().openapi({ description: 'Page de consentement de Google (scope gmail.modify)' }),
  })
  .openapi('GmailAuthorizationUrl');

/** EF-CFG-01 */
export const GmailStatusSchema = z
  .discriminatedUnion('connected', [
    z.object({ connected: z.literal(false) }),
    z.object({
      connected: z.literal(true),
      emailAddress: z.string().email(),
      connectedAt: DateTimeSchema,
      lastRunAt: DateTimeSchema.nullable().openapi({
        description: 'Fin de la dernière synchronisation réussie (EF-CFG-01) ; null si aucune',
      }),
      lastSyncAt: DateTimeSchema.nullable().openapi({
        description:
          'Date jusqu’à laquelle tout est traité (EF-GML-06) ; null avec `lastRunAt` renseigné = rattrapage en cours',
      }),
      applyLabels: z.boolean().openapi({ description: 'Écriture des libellés dans Gmail (EF-GML-17)' }),
      lookbackDays: z
        .number()
        .int()
        .openapi({ description: 'Période de la première synchronisation, en jours (EF-GML-05, EF-CFG-04)' }),
      authorizationExpired: z
        .boolean()
        .openapi({ description: 'Autorisation refusée par Google (Q-11) : reconnecter Gmail' }),
    }),
  ])
  .openapi('GmailStatus');

/** EF-GML-05: bornes de N, la période de la première synchronisation. */
export const MIN_LOOKBACK_DAYS = 1;
export const MAX_LOOKBACK_DAYS = 365;

/** EF-GML-17, EF-CFG-04 : au moins un réglage, les autres gardent leur valeur. */
export const GmailSettingsBodySchema = z
  .object({
    applyLabels: z
      .boolean()
      .optional()
      .openapi({ description: 'false : mode lecture seule, Tracandi ne modifie aucun libellé dans Gmail' }),
    lookbackDays: z
      .number()
      .int()
      .min(MIN_LOOKBACK_DAYS)
      .max(MAX_LOOKBACK_DAYS)
      .optional()
      .openapi({ description: 'Période de la première synchronisation, en jours (1 à 365, EF-GML-05)' }),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Indiquez au moins un réglage à modifier',
  })
  .openapi('GmailSettingsBody');

/** EF-GML-04 : compteurs d'une passe, publiés comme compteurs d'exécution (`messages_read`…). */
