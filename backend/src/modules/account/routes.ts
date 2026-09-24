import { Router } from 'express';
import { asyncHandler } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import { errorResponses, type OpenAPIRegistry, SESSION_SECURITY } from '../../lib/openapi.js';
import type { AccountService } from './service.js';

const registerAccountDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/account/export',
    tags: ['Comptes'],
    summary: 'Télécharger toutes ses données',
    description:
      'EF-AUT-12 (droits d’accès et à la portabilité). Fichier JSON en pièce jointe : compte, réglages, connexion ' +
      'Gmail, entreprises et candidatures avec leur historique et leurs messages, profil, veille, exécutions, journal ' +
      'd’usage de l’IA. Aucun secret : ni empreinte de mot de passe, ni jeton.',
    security: SESSION_SECURITY,
    responses: {
      200: {
        description: 'Fichier `tracandi-donnees-AAAA-MM-JJ.json`',
        content: { 'application/json': { schema: {} } },
      },
      ...errorResponses(401),
    },
  });
};

/**
 * GDPR rights exercised from the application, behind the session guard: the export of the user's data. The
 * deletion of the account belongs to the account routes (`DELETE /auth/account`).
 * @req EF-AUT-12
 */
export const createAccountModule = (service: AccountService): ApiModule => {
  const router = Router();
  router.get(
    '/account/export',
    asyncHandler(async (_req, res) => {
      const data = await service.exportData(currentUserId(res));
      const day = data.exportedAt.toISOString().slice(0, 10);
      res
        .status(200)
        .attachment(`tracandi-donnees-${day}.json`)
        .type('application/json')
        .send(JSON.stringify(data, null, 2));
    }),
  );
  return { router, registerDocs: registerAccountDocs };
};
