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
  AppliedOfferSchema,
  OfferDetailSchema,
  OfferIdSchema,
  OfferListSchema,
  OfferQuerySchema,
  OfferViewSchema,
  UpdateOfferSchema,
} from './schemas.js';
import type { OffersService } from './service.js';

const CREATED = 201;

const registerOffersDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/offers',
    summary: 'Offres repérées par la veille',
    description:
      'EF-VEI-16, EF-VEI-17, EF-VEI-18, EF-VEI-22. Meilleur score d’abord, les offres non notées en dernier. ' +
      'Vue `active` par défaut : les offres à regarder et celles que le candidat a gardées.',
    request: { query: OfferQuerySchema },
    responses: { 200: jsonResponse('Offres', OfferListSchema), ...errorResponses(400, 401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/offers/{id}',
    summary: 'Détail d’une offre',
    description: 'EF-VEI-16. L’offre avec son texte, absent de la liste.',
    request: { params: OfferIdSchema },
    responses: { 200: jsonResponse('Offre', OfferDetailSchema), ...errorResponses(400, 401, 404) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'patch',
    path: '/offers/{id}',
    summary: 'Garder ou écarter une offre',
    description: 'EF-VEI-18. Une offre postulée ne change plus d’état (409).',
    request: { params: OfferIdSchema, body: jsonBody(UpdateOfferSchema) },
    responses: { 200: jsonResponse('Offre', OfferViewSchema), ...errorResponses(400, 401, 404, 409) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/offers/{id}/apply',
    summary: 'Déclarer avoir postulé',
    description:
      'EF-VEI-19, EF-VEI-20. L’offre passe à l’état « postulée » et une candidature « Envoyée » est créée à son ' +
      'entreprise, avec son intitulé et son type de contrat.',
    request: { params: OfferIdSchema },
    responses: {
      201: jsonResponse('Candidature créée', AppliedOfferSchema),
      ...errorResponses(400, 401, 404, 409),
    },
  });
};

/**
 * Offers of the watch, behind the session guard; every route is scoped to the signed-in candidate (EF-AUT-06).
 * @req EF-VEI-16 to EF-VEI-20, EF-VEI-22
 */
export const createOffersModule = (service: OffersService): ApiModule => {
  const router = Router();

  router.get(
    '/offers',
    asyncHandler(async (req, res) => {
      const { query } = validate(req, { query: OfferQuerySchema });
      res.status(200).json(await service.list(currentUserId(res), query));
    }),
  );

  router.get(
    '/offers/:id',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: OfferIdSchema });
      res.status(200).json(await service.get(currentUserId(res), params.id));
    }),
  );

  router.patch(
    '/offers/:id',
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, { params: OfferIdSchema, body: UpdateOfferSchema });
      res.status(200).json(await service.setStatus(currentUserId(res), params.id, body));
    }),
  );

  router.post(
    '/offers/:id/apply',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: OfferIdSchema });
      res.status(CREATED).json(await service.apply(currentUserId(res), params.id));
    }),
  );

  return { router, registerDocs: registerOffersDocs };
};
