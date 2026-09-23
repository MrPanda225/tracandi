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
  CreateSourceSchema,
  SourceIdSchema,
  SourceListSchema,
  SourceViewSchema,
  UpdateSourceSchema,
  WatchReportSchema,
} from './schemas.js';
import type { WatchService } from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;

const registerSitesDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'get',
    path: '/sites',
    summary: 'Sources surveillées',
    description:
      'EF-VEI-01. Sources du candidat, par entreprise, avec la date de leur dernière consultation (EF-VEI-10) ' +
      'et l’erreur de la dernière consultation échouée (EF-VEI-11).',
    responses: { 200: jsonResponse('Sources surveillées', SourceListSchema), ...errorResponses(401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/sites',
    summary: 'Ajouter une source surveillée',
    description:
      'EF-VEI-01, EF-VEI-02. L’identifiant est lu par la règle RG-08 du type choisi : un slug pour Greenhouse, ' +
      'Lever, SmartRecruiters et Recruitee, une adresse https pour Workday et pour une page carrières.',
    request: { body: jsonBody(CreateSourceSchema) },
    responses: {
      201: jsonResponse('Source ajoutée', SourceViewSchema),
      ...errorResponses(400, 401, 409),
    },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'patch',
    path: '/sites/{id}',
    summary: 'Suspendre ou réactiver une source',
    description: 'EF-VEI-04. Une source suspendue n’est plus consultée.',
    request: { params: SourceIdSchema, body: jsonBody(UpdateSourceSchema) },
    responses: { 200: jsonResponse('Source', SourceViewSchema), ...errorResponses(400, 401, 404) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'delete',
    path: '/sites/{id}',
    summary: 'Retirer une source surveillée',
    description: 'EF-VEI-05. Les offres de la source sont supprimées avec elle.',
    request: { params: SourceIdSchema },
    responses: { 204: { description: 'Source retirée' }, ...errorResponses(400, 401, 404) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/sites/run',
    summary: 'Consulter toutes les sources actives maintenant',
    description:
      'EF-VEI-07. Chaque source active est lue, les offres déjà connues sont laissées de côté (EF-VEI-09) et ' +
      'les nouvelles sont notées (EF-VEI-12). Une source en échec n’interrompt pas les autres (ENF-FIA-02).',
    responses: { 200: jsonResponse('Résultat de la passe', WatchReportSchema), ...errorResponses(401, 409) },
  });
};

/**
 * Watch of the career sources, behind the session guard. Every route is scoped to the signed-in candidate
 * (EF-AUT-06).
 * @req EF-VEI-01 to EF-VEI-07
 */
export const createSitesModule = (service: WatchService): ApiModule => {
  const router = Router();

  router.get(
    '/sites',
    asyncHandler(async (_req, res) => {
      res.status(200).json({ items: await service.list(currentUserId(res)) });
    }),
  );

  router.post(
    '/sites',
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: CreateSourceSchema });
      res.status(CREATED).json(await service.add(currentUserId(res), body));
    }),
  );

  router.patch(
    '/sites/:id',
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, { params: SourceIdSchema, body: UpdateSourceSchema });
      res.status(200).json(await service.setActive(currentUserId(res), params.id, body.isActive));
    }),
  );

  router.delete(
    '/sites/:id',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: SourceIdSchema });
      await service.remove(currentUserId(res), params.id);
      res.status(NO_CONTENT).end();
    }),
  );

  router.post(
    '/sites/run',
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.checkNow(currentUserId(res)));
    }),
  );

  return { router, registerDocs: registerSitesDocs };
};
