import { Router } from 'express';
import { asyncHandler, validate } from '../../lib/http.js';
import { currentUserId } from '../../lib/middleware.js';
import type { ApiModule } from '../../lib/module.js';
import {
  errorResponses,
  jsonBody,
  jsonResponse,
  type OpenAPIRegistry,
  SESSION_SECURITY,
} from '../../lib/openapi.js';
import { CandidateProfileSchema } from './schemas.js';
import type { ProfileService } from './service.js';

const TAG = ['Atelier CV'];

const registerProfileDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: '/profile',
    summary: 'Profil de référence du candidat',
    description:
      'EF-CVX-01. Source unique des CV générés (RG-12) et des cibles qui notent les offres (RG-09). ' +
      '404 tant qu’aucun profil n’est enregistré.',
    responses: {
      200: jsonResponse('Profil de référence', CandidateProfileSchema),
      ...errorResponses(401, 404),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'put',
    path: '/profile',
    summary: 'Enregistrer le profil de référence',
    description:
      'EF-CVX-02. Remplace le profil en entier ; un profil invalide au regard du schéma est refusé (400) et ' +
      'l’ancien est conservé.',
    request: { body: jsonBody(CandidateProfileSchema) },
    responses: { 204: { description: 'Profil enregistré' }, ...errorResponses(400, 401, 415) },
  });
};

/**
 * Reference profile of the candidate, behind the session guard: each user reads and writes their own (EF-AUT-06).
 * @req EF-CVX-01, EF-CVX-02
 */
export const createProfileModule = (service: ProfileService): ApiModule => {
  const router = Router();

  router.get(
    '/profile',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.read(currentUserId(res)));
    }),
  );

  router.put(
    '/profile',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: CandidateProfileSchema });
      await service.replace(currentUserId(res), body);
      res.status(204).end();
    }),
  );

  return { router, registerDocs: registerProfileDocs };
};
