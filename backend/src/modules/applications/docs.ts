import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  type OpenAPIRegistry,
  SESSION_SECURITY,
  z,
} from '../../lib/openapi.js';
import {
  ApplicationDetailSchema,
  ApplicationListSchema,
  CreateApplicationBodySchema,
  EmailSchema,
  IdParamsSchema,
  ListApplicationsQuerySchema,
  ReattachEmailBodySchema,
  UpdateApplicationBodySchema,
} from './schemas.js';

const TAG = ['Candidatures'];
const CreatedSchema = z.object({ id: z.number().int() });

const common = { tags: TAG, security: SESSION_SECURITY };

// One entry per route (EF-DOC-01); `createApplicationsModule` mounts the same paths.
const ROUTES: RouteConfig[] = [
  {
    ...common,
    method: 'get',
    path: '/applications',
    summary: 'Lister les candidatures',
    description:
      'EF-CAN-01, 02, 03, 12, 14. Triées par entreprise (ordre alphabétique) puis par activité la plus récente. ' +
      '`isFollowUpDue` signale les candidatures à relancer (RG-06).',
    request: { query: ListApplicationsQuerySchema },
    responses: {
      200: jsonResponse('Page de candidatures', ApplicationListSchema),
      ...errorResponses(400, 401),
    },
  },
  {
    ...common,
    method: 'post',
    path: '/applications',
    summary: 'Créer une candidature',
    description: "EF-CAN-06, 08, 13. L'entreprise est créée si elle n'existe pas (clé normalisée RG-14).",
    request: { body: jsonBody(CreateApplicationBodySchema) },
    responses: {
      201: jsonResponse('Candidature créée', CreatedSchema),
      ...errorResponses(400, 401, 409, 415),
    },
  },
  {
    ...common,
    method: 'get',
    path: '/applications/{id}',
    summary: 'Consulter une candidature',
    request: { params: IdParamsSchema },
    description: 'Avec la description de l’offre (EF-CAN-15), absente de la liste.',
    responses: {
      200: jsonResponse('Candidature', ApplicationDetailSchema),
      ...errorResponses(400, 401, 404),
    },
  },
  {
    ...common,
    method: 'patch',
    path: '/applications/{id}',
    summary: 'Modifier une candidature',
    description: 'EF-CAN-07, 08, 13. Un changement de statut est historisé et compte comme une activité.',
    request: { params: IdParamsSchema, body: jsonBody(UpdateApplicationBodySchema) },
    responses: { 204: { description: 'Modifiée' }, ...errorResponses(400, 401, 404, 409, 415) },
  },
  {
    ...common,
    method: 'delete',
    path: '/applications/{id}',
    summary: 'Supprimer une candidature',
    description: 'EF-CAN-09. Les messages associés restent enregistrés, détachés.',
    request: { params: IdParamsSchema },
    responses: { 204: { description: 'Supprimée' }, ...errorResponses(400, 401, 404, 415) },
  },
  {
    ...common,
    method: 'get',
    path: '/applications/{id}/emails',
    summary: "Chronologie des messages d'une candidature",
    description: 'EF-CAN-04, 05. Ordre chronologique croissant, avec un lien vers le fil Gmail.',
    request: { params: IdParamsSchema },
    responses: { 200: jsonResponse('Messages', z.array(EmailSchema)), ...errorResponses(400, 401, 404) },
  },
  {
    tags: ['Messages'],
    security: SESSION_SECURITY,
    method: 'patch',
    path: '/emails/{id}',
    summary: 'Rattacher un message à une autre candidature',
    description:
      'EF-CAN-10. Le statut de la candidature cible suit RG-02 et RG-04 ; `null` détache le message.',
    request: { params: IdParamsSchema, body: jsonBody(ReattachEmailBodySchema) },
    responses: { 204: { description: 'Rattaché' }, ...errorResponses(400, 401, 404, 415) },
  },
];

/**
 * Documents the application and message routes in the OpenAPI registry.
 * @req EF-DOC-01
 */
export const registerApplicationsDocs = (registry: OpenAPIRegistry): void => {
  for (const route of ROUTES) registry.registerPath(route);
};
