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
import { AutomaticWatchBodySchema, AutomaticWatchSchema } from './schemas.js';
import type { AutomaticWatchService } from './service.js';

const registerAutomaticWatchDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/watch/automatic',
    summary: 'Veille automatique : réglages et passages du jour',
    description:
      'EF-CFG-07, EF-CFG-08. Veille activée ou non, créneaux choisis (matin, midi, soir) et passages planifiés ' +
      'du jour avec leur état, leurs compteurs et, pour un passage ignoré ou en échec, la raison (EF-VEI-55). ' +
      'Jamais le contenu d’une offre.',
    responses: { 200: jsonResponse('Veille automatique', AutomaticWatchSchema), ...errorResponses(401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'put',
    path: '/watch/automatic',
    summary: 'Activer, arrêter ou régler la veille automatique',
    description:
      'EF-CFG-07. Remplacement complet. Au moins un créneau lorsque la veille est activée, sinon 400 ; chaque ' +
      'créneau compte une fois, dans l’ordre de la journée.',
    request: { body: jsonBody(AutomaticWatchBodySchema) },
    responses: {
      200: jsonResponse('Veille automatique enregistrée', AutomaticWatchSchema),
      ...errorResponses(400, 401),
    },
  });
};

/**
 * The watch that runs by itself, behind the session guard (EF-AUT-06).
 * @req EF-CFG-07, EF-CFG-08
 */
export const createAutomaticWatchModule = (service: AutomaticWatchService): ApiModule => {
  const router = Router();

  router.get(
    '/watch/automatic',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.read(currentUserId(res)));
    }),
  );

  router.put(
    '/watch/automatic',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: AutomaticWatchBodySchema });
      res.status(200).json(await service.save(currentUserId(res), body));
    }),
  );

  return { router, registerDocs: registerAutomaticWatchDocs };
};
