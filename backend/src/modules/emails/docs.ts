import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  type OpenAPIRegistry,
  SESSION_SECURITY,
} from '../../lib/openapi.js';
import { AcceptedRunSchema } from '../jobs/schemas.js';
import {
  AuthorizationAnswerQuerySchema,
  AuthorizationUrlSchema,
  GmailSettingsBodySchema,
  GmailStatusSchema,
} from './schemas.js';

const TAG = ['Gmail'];

// One entry per route (EF-DOC-01); `createGmailModules` mounts the same paths.
const ROUTES: RouteConfig[] = [
  {
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: '/gmail/authorization-url',
    summary: 'Obtenir l’adresse de consentement Google',
    description:
      'EF-GML-01, ENF-SEC-07, ENF-SEC-14. Scope `gmail.modify` seul ; `state` aléatoire à usage unique, valable 10 minutes.',
    responses: {
      200: jsonResponse('Adresse de la page de Google', AuthorizationUrlSchema),
      ...errorResponses(401, 429),
    },
  },
  {
    tags: TAG,
    method: 'get',
    path: '/gmail/callback',
    summary: 'Retour de Google après le consentement',
    description:
      'EF-GML-01, ENF-SEC-14. Appelée par le navigateur au retour de Google, sans cookie de session : le `state` ' +
      'identifie l’utilisateur. Redirige vers l’écran Réglages avec `?gmail=connected|refused|expired|failed`.',
    request: { query: AuthorizationAnswerQuerySchema },
    responses: { 302: { description: 'Redirection vers l’écran Réglages' }, ...errorResponses(429) },
  },
  {
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: '/gmail/status',
    summary: 'État de la connexion Gmail',
    description:
      'EF-CFG-01, EF-CFG-04, EF-GML-17. Adresse connectée, date de connexion, fin de la dernière synchronisation ' +
      'réussie (`lastRunAt`), date jusqu’à laquelle tout est traité (`lastSyncAt`, null pendant un rattrapage), ' +
      'écriture des libellés, période de la première synchronisation.',
    responses: { 200: jsonResponse('Connexion Gmail', GmailStatusSchema), ...errorResponses(401) },
  },
  {
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'delete',
    path: '/gmail/connection',
    summary: 'Déconnecter Gmail',
    description:
      'EF-GML-02. Révoque le jeton chez Google quand c’est possible ; aucun jeton ne reste en base.',
    responses: { 204: { description: 'Déconnectée (ou déjà non connectée)' }, ...errorResponses(401, 415) },
  },
  {
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'patch',
    path: '/gmail/settings',
    summary: 'Régler la synchronisation Gmail',
    description:
      'EF-GML-17, EF-CFG-04. `applyLabels: false` passe en lecture seule : aucune synchronisation ne modifie plus ' +
      'les libellés. `lookbackDays` (1 à 365) fixe la période de la première synchronisation (N d’EF-GML-05) ; ' +
      'au moins un des deux réglages est attendu.',
    request: { body: jsonBody(GmailSettingsBodySchema) },
    responses: { 204: { description: 'Réglage enregistré' }, ...errorResponses(400, 401, 415) },
  },
  {
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'post',
    path: '/gmail/sync',
    summary: 'Mettre une synchronisation Gmail en file',
    description:
      'EF-GML-04, EF-EXE-01. Met une passe en file et répond aussitôt son identifiant d’exécution : ' +
      'l’avancement se suit par `GET /jobs/{id}` et `GET /jobs/stream` (EF-EXE-03, EF-EXE-04). ' +
      'Une passe lit au plus 200 nouveaux messages : la première synchronisation en demande plusieurs. ' +
      'Les échecs — boîte non connectée, autorisation expirée, quota Gmail, aucun fournisseur d’IA — ferment ' +
      'l’exécution en échec avec leur message, jamais la requête.',
    responses: {
      202: jsonResponse('Exécution mise en file', AcceptedRunSchema),
      ...errorResponses(401, 415),
    },
  },
];

/** Registers the Gmail connection routes in the OpenAPI description (EF-DOC-01). */
export const registerGmailDocs = (registry: OpenAPIRegistry): void => {
  for (const route of ROUTES) registry.registerPath(route);
};
