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
  ImportBodySchema,
  ImportPreviewBodySchema,
  ImportPreviewSchema,
  ImportResultSchema,
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
    method: 'post',
    path: '/applications/import/preview',
    summary: 'Aperçu d’un fichier CSV à importer',
    description:
      'EF-CAN-23. Le fichier (CSV, séparateur « , » ou « ; », 1 Mo, 1 000 lignes et 50 colonnes au plus, en ' +
      'base64) est lu sans rien enregistrer : en-têtes, 5 premières lignes, encodage lu et colonne proposée pour ' +
      'chaque champ d’après le nom des colonnes. Il est lu en UTF-8, ou en Windows-1252 s’il n’est pas de ' +
      'l’UTF-8 valide (export Excel sous Windows). 400 pour un CSV illisible, plus de 50 colonnes ou deux ' +
      'colonnes du même nom ; 413 au-delà de 1 Mo ou de 1 000 lignes ; 415 pour un fichier qui n’est pas du texte.',
    request: { body: jsonBody(ImportPreviewBodySchema) },
    responses: {
      200: jsonResponse('Aperçu', ImportPreviewSchema),
      ...errorResponses(400, 401, 413, 415),
    },
  },
  {
    ...common,
    method: 'post',
    path: '/applications/import',
    summary: 'Importer les candidatures d’un fichier CSV',
    description:
      'EF-CAN-23. Le même fichier et la correspondance validée par le candidat. Une ligne qui désigne une ' +
      'candidature existante ou une ligne précédente — même entreprise (RG-26) et même intitulé (RG-25), RG-03 ' +
      '(a) et (b) — est ignorée ; une ligne invalide est refusée avec son numéro et sa raison. Dates JJ/MM/AAAA, ' +
      'AAAA-MM-JJ ou JJ/MM/AA ; statut par son libellé français ou anglais (Envoyée par défaut). Le lien de ' +
      'l’offre est placé en tête des notes tant que la candidature n’a pas de champ dédié (T-902). Tout est ' +
      'enregistré dans une seule transaction.',
    request: { body: jsonBody(ImportBodySchema) },
    responses: {
      200: jsonResponse('Résultat de l’import', ImportResultSchema),
      ...errorResponses(400, 401, 413, 415),
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
