import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  type ResponseConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Must run before any schema calls `.openapi()`: every schema file imports `z` from this module.
extendZodWithOpenApi(z);

export { z };

/** Name of the session cookie, also declared as the OpenAPI security scheme (ADR-09). */
export const SESSION_COOKIE_NAME = 'tracandi_session';
export const SESSION_SECURITY = [{ sessionCookie: [] }];

/** Error body returned by every failing route (central error handler). */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Données invalides' }),
    details: z
      .array(z.object({ path: z.string().openapi({ example: 'body.status' }), message: z.string() }))
      .optional(),
  })
  .openapi('Error');

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Données invalides (détail par champ dans `details`)',
  401: 'Authentification requise ou session expirée',
  403: 'Origine non autorisée',
  404: 'Ressource introuvable ou appartenant à un autre utilisateur',
  409: 'Conflit avec une donnée existante',
  415: 'Le type de contenu doit être application/json',
  429: 'Trop de requêtes',
  500: 'Erreur interne du serveur',
};

/** OpenAPI responses for the given error status codes, all sharing the `Error` schema. */
export const errorResponses = (...statusCodes: number[]): Record<number, ResponseConfig> =>
  Object.fromEntries(
    statusCodes.map((code) => [
      code,
      {
        description: ERROR_DESCRIPTIONS[code] ?? 'Erreur',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    ]),
  );

/** JSON response with the given description and body schema. */
export const jsonResponse = (description: string, schema: z.ZodTypeAny): ResponseConfig => ({
  description,
  content: { 'application/json': { schema } },
});

/** JSON request body for `registerPath`. */
export const jsonBody = (schema: z.ZodTypeAny) => ({ content: { 'application/json': { schema } } });

/** Registry with the session cookie security scheme declared. */
export const createOpenApiRegistry = (): OpenAPIRegistry => {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE_NAME,
    description: 'Cookie posé par `POST /api/auth/login` ou `POST /api/auth/register`.',
  });
  return registry;
};

/**
 * Generates the OpenAPI 3 document of every path registered in `registry`.
 * @req EF-DOC-01
 */
export const buildOpenApiDocument = (registry: OpenAPIRegistry) =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Tracandi API',
      version: '0.1.0',
      description:
        'API de suivi des candidatures. Toutes les routes, sauf `/health` et `/auth/*`, exigent une session : ' +
        'se connecter avec `POST /api/auth/login`, le cookie est ensuite envoyé automatiquement. ' +
        'Toute écriture doit être envoyée en `application/json`.',
    },
    servers: [{ url: '/api' }],
  });

export type { OpenAPIRegistry };
