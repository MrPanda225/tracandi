import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { errorResponses, jsonResponse, type OpenAPIRegistry, SESSION_SECURITY } from '../../lib/openapi.js';
import {
  AuthorizationAnswerQuerySchema,
  AuthorizationUrlSchema,
  GmailStatusSchema,
  SyncReportSchema,
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
    description: 'EF-CFG-01. Adresse connectée, date de connexion et de dernière synchronisation.',
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
    method: 'post',
    path: '/gmail/sync',
    summary: 'Synchroniser Gmail maintenant',
    description:
      'EF-GML-04. Lit les nouveaux messages reçus et envoyés, écarte sans IA ceux sans indicateur d’emploi (RG-10), ' +
      'classe les autres par lots de 10 et met à jour les candidatures (RG-03, RG-04). 409 sans boîte connectée ou ' +
      'pendant une synchronisation ; 502 si aucun fournisseur d’IA ne répond (les lots déjà classés sont conservés).',
    responses: {
      200: jsonResponse('Compteurs de la synchronisation', SyncReportSchema),
      ...errorResponses(401, 409, 415, 502),
    },
  },
];

/** Registers the Gmail connection routes in the OpenAPI description (EF-DOC-01). */
export const registerGmailDocs = (registry: OpenAPIRegistry): void => {
  for (const route of ROUTES) registry.registerPath(route);
};
