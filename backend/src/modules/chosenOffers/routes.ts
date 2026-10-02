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
import { StartedAnalysisSchema } from '../cvWorkshop/schemas.js';
import {
  ChooseOfferBodySchema,
  ChosenOfferIdParamsSchema,
  ChosenOfferListSchema,
  ChosenOfferSchema,
  UpdateChosenOfferBodySchema,
} from './schemas.js';
import type { ChosenOffersService } from './service.js';

const PATH = '/chosen-offers';
const TAG = ['Veille'];

const registerChosenOffersDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: PATH,
    summary: 'Offres choisies par niveau',
    description:
      'EF-VEI-48, EF-VEI-49. Jusqu’à 3 offres par niveau (junior, confirmé, senior) : intitulé, mots-clés, années ' +
      'd’expérience exigées et niveau que ces traits indiquent. Jamais le texte collé (ENF-RGP-14).',
    responses: { 200: jsonResponse('Offres choisies', ChosenOfferListSchema), ...errorResponses(401) },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'post',
    path: PATH,
    summary: 'Choisir une offre pour un niveau',
    description:
      'EF-VEI-48, EF-VEI-49. Le texte de l’offre (de 200 à 20 000 caractères) est lu dans la file d’exécution : ' +
      'coordonnées du recruteur retirées, intitulé et mots-clés par le modèle (le modèle local en premier), années ' +
      'd’expérience par le code (RG-29). Seuls ces traits sont gardés. Répond aussitôt l’identifiant de ' +
      'l’exécution. 409 au-delà de 3 offres pour le niveau, 429 au-delà de 20 lectures par jour.',
    request: { body: jsonBody(ChooseOfferBodySchema) },
    responses: {
      202: jsonResponse('Lecture en file', StartedAnalysisSchema),
      ...errorResponses(400, 401, 409, 429),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'patch',
    path: `${PATH}/{id}`,
    summary: 'Corriger les traits d’une offre choisie',
    description:
      'EF-VEI-49. Intitulé (1 à 80 caractères), mots-clés (1 à 15), années (0 à 50, ou null : l’offre n’en exige ' +
      'pas) et niveau. Changer de niveau suppose de la place dans l’autre (409 sinon).',
    request: { params: ChosenOfferIdParamsSchema, body: jsonBody(UpdateChosenOfferBodySchema) },
    responses: {
      200: jsonResponse('Offre choisie', ChosenOfferSchema),
      ...errorResponses(400, 401, 404, 409),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'delete',
    path: `${PATH}/{id}`,
    summary: 'Retirer une offre choisie',
    description: 'EF-VEI-48, ENF-RGP-02. Plus aucune ligne pour cette offre.',
    request: { params: ChosenOfferIdParamsSchema },
    responses: { 204: { description: 'Offre retirée' }, ...errorResponses(400, 401, 404) },
  });
};

/**
 * The offers chosen by level, behind the session guard: each candidate sees only their own (EF-AUT-06).
 * @req EF-VEI-48, EF-VEI-49
 */
export const createChosenOffersModule = (service: ChosenOffersService): ApiModule => {
  const router = Router();

  router.get(
    PATH,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.list(currentUserId(res)));
    }),
  );

  router.post(
    PATH,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ChooseOfferBodySchema });
      res.status(202).json({ runId: await service.startExtraction(currentUserId(res), body) });
    }),
  );

  router.patch(
    `${PATH}/:id`,
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, {
        params: ChosenOfferIdParamsSchema,
        body: UpdateChosenOfferBodySchema,
      });
      res.status(200).json(await service.update(currentUserId(res), params.id, body));
    }),
  );

  router.delete(
    `${PATH}/:id`,
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: ChosenOfferIdParamsSchema });
      await service.remove(currentUserId(res), params.id);
      res.status(204).end();
    }),
  );

  return { router, registerDocs: registerChosenOffersDocs };
};
