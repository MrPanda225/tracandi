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
import {
  CriteriaResponseSchema,
  PlaceListSchema,
  PlaceQuerySchema,
  ProfileValidationBodySchema,
  WatchCriteriaSchema,
} from './schemas.js';
import type { CriteriaService } from './service.js';

const registerCriteriaDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/watch/criteria',
    summary: 'Critères de recherche',
    description:
      'EF-VEI-29. Les cibles, la commune, le rayon, le télétravail et les codes ROME du candidat ; `null` tant ' +
      'qu’il n’en a enregistré aucun.',
    responses: { 200: jsonResponse('Critères', CriteriaResponseSchema), ...errorResponses(401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'put',
    path: '/watch/criteria',
    summary: 'Enregistrer les critères de recherche',
    description:
      'EF-VEI-29, EF-VEI-31. Remplacement complet. Les critères servent aux requêtes vers les sources ' +
      'officielles et à la notation de chaque offre (RG-09).',
    request: { body: jsonBody(WatchCriteriaSchema) },
    responses: {
      200: jsonResponse('Critères enregistrés', CriteriaResponseSchema),
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/watch/criteria/validation',
    summary: 'Valider le profil déduit des CV types',
    description:
      'EF-VEI-46, EF-VEI-47. Les offres types que le candidat cherche, corrigées ou non, et ses années d’expérience ' +
      '(de 0 à 50) ou son niveau : elles deviennent les cibles de ses critères, le niveau étant recalculé à partir ' +
      'des années (RG-28). La commune, le rayon, le télétravail et les codes ROME restent ceux du candidat. Tant ' +
      'que rien n’est validé, seuls les critères enregistrés servent à la notation et aux sources officielles.',
    request: { body: jsonBody(ProfileValidationBodySchema) },
    responses: {
      200: jsonResponse('Critères enregistrés', CriteriaResponseSchema),
      ...errorResponses(400, 401),
    },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/watch/places',
    summary: 'Rechercher une commune',
    description:
      'EF-VEI-30. Les cinq communes les plus peuplées dont le nom commence comme le texte saisi, d’après le ' +
      'service public du découpage administratif ; seul ce texte lui est transmis (ENF-RGP-11).',
    request: { query: PlaceQuerySchema },
    responses: { 200: jsonResponse('Communes', PlaceListSchema), ...errorResponses(400, 401, 502) },
  });
};

/**
 * Search criteria of the watch, behind the session guard (EF-AUT-06).
 * @req EF-VEI-29, EF-VEI-30, EF-VEI-46, EF-VEI-47
 */
export const createCriteriaModule = (service: CriteriaService): ApiModule => {
  const router = Router();

  router.get(
    '/watch/criteria',
    asyncHandler(async (_req, res) => {
      res.status(200).json({ criteria: await service.read(currentUserId(res)) });
    }),
  );

  router.put(
    '/watch/criteria',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: WatchCriteriaSchema });
      res.status(200).json({ criteria: await service.save(currentUserId(res), body) });
    }),
  );

  router.post(
    '/watch/criteria/validation',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ProfileValidationBodySchema });
      res.status(200).json({ criteria: await service.validateProfile(currentUserId(res), body) });
    }),
  );

  router.get(
    '/watch/places',
    asyncHandler(async (req, res) => {
      const { query } = validate(req, { query: PlaceQuerySchema });
      res.status(200).json({ items: await service.findPlaces(query.q) });
    }),
  );

  return { router, registerDocs: registerCriteriaDocs };
};
