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
      lastSyncAt: DateTimeSchema.nullable(),
    }),
  ])
  .openapi('GmailStatus');
