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
import { SOURCE_ADAPTERS } from '../../scraper/adapters/index.js';
import {
  CreateSourceSchema,
  SourceIdSchema,
  CompanyIdSchema,
  SourceListSchema,
  SourceSuggestionListSchema,
  SourceTypeListSchema,
  SourceViewSchema,
  UpdateSourceSchema,
} from './schemas.js';
import { AcceptedRunSchema } from '../jobs/schemas.js';
import type { WatchService } from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;
const ACCEPTED = 202;

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
    method: 'get',
    path: '/sites/types',
    summary: 'Types de source pris en charge',
    description:
      'EF-VEI-01, EF-VEI-08. Les six types de source, avec leur nom et ce que le candidat doit saisir comme ' +
      'identifiant (RG-08). L’écran lit cette liste plutôt que de la tenir lui-même (ENF-MAI-03).',
    responses: { 200: jsonResponse('Types de source', SourceTypeListSchema), ...errorResponses(401) },
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
    method: 'get',
    path: '/sites/suggestions',
    summary: 'Sources à surveiller déduites des candidatures',
    description:
      'EF-VEI-23, EF-VEI-24. Les entreprises auxquelles le candidat a postulé et qu’il ne surveille pas encore, ' +
      'avec le domaine d’où elles lui ont écrit (RG-19) et le type de source que ce domaine désigne. Rien n’est ' +
      'ajouté d’office : la proposition est pré-remplie, le candidat confirme. Aucune requête sortante.',
    responses: { 200: jsonResponse('Propositions', SourceSuggestionListSchema), ...errorResponses(401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/sites/suggestions/{companyId}/dismiss',
    summary: 'Écarter une proposition',
    description: 'EF-VEI-25. L’entreprise n’est plus proposée. Elle reste ajoutable à la main.',
    request: { params: CompanyIdSchema },
    responses: { 204: { description: 'Proposition écartée' }, ...errorResponses(400, 401, 404) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/sites/suggestions/discover',
    summary: 'Rechercher les pages carrières des entreprises proposées',
    description:
      'EF-VEI-38 à EF-VEI-40. Mise en file : pour chaque entreprise proposée, l’accueil de son site est lu, puis au ' +
      'besoin la page carrières qu’il désigne ; le logiciel de recrutement est reconnu à ses liens et scripts (RG-27) ' +
      'et la source trouvée est consultée une fois. Les propositions portent ensuite le résultat ; aucune source ' +
      'n’est ajoutée d’office (RG-19).',
    responses: { 202: jsonResponse('Recherche mise en file', AcceptedRunSchema), ...errorResponses(401) },
  });

  registry.registerPath({
    tags: ['Veille'],
    security: SESSION_SECURITY,
    method: 'post',
    path: '/sites/run',
    summary: 'Consulter toutes les sources actives maintenant',
    description:
      'EF-VEI-07, EF-EXE-01. La passe est mise en file et la réponse ne l’attend pas : elle rend l’identifiant ' +
      'de l’exécution, à suivre par `GET /jobs/{id}` ou `GET /jobs/stream`. Chaque source active est lue, les ' +
      'offres déjà connues sont laissées de côté (EF-VEI-09) et les nouvelles sont notées (EF-VEI-12). Une ' +
      'source en échec n’interrompt pas les autres (ENF-FIA-02).',
    responses: { 202: jsonResponse('Passe mise en file', AcceptedRunSchema), ...errorResponses(401) },
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

  router.get('/sites/types', (_req, res) => {
    res.status(200).json({
      items: SOURCE_ADAPTERS.map((adapter) => ({
        id: adapter.id,
        label: adapter.label,
        identifierHint: adapter.identifierHint,
        isOfficial: adapter.isOfficial === true,
      })),
    });
  });

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

  router.get(
    '/sites/suggestions',
    asyncHandler(async (_req, res) => {
      res.status(200).json({ items: await service.suggestions(currentUserId(res)) });
    }),
  );

  router.post(
    '/sites/suggestions/:companyId/dismiss',
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: CompanyIdSchema });
      await service.dismissSuggestion(currentUserId(res), params.companyId);
      res.status(NO_CONTENT).end();
    }),
  );

  router.post(
    '/sites/suggestions/discover',
    asyncHandler(async (_req, res) => {
      res.status(ACCEPTED).json({ runId: await service.discoverSources(currentUserId(res)) });
    }),
  );

  router.post(
    '/sites/run',
    asyncHandler(async (_req, res) => {
      // EF-EXE-01: the pass is queued, the answer does not wait for it (ENF-PERF-06).
      res.status(ACCEPTED).json({ runId: await service.checkNow(currentUserId(res)) });
    }),
  );

  return { router, registerDocs: registerSitesDocs };
};
