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
import { CV_MAX_BASE64_LENGTH } from '../cvWorkshop/upload.js';
import {
  CvTypeIdParamsSchema,
  CvTypeListSchema,
  ImportCvTypeBodySchema,
  ProfileDeductionSchema,
  ReplaceCvTypeBodySchema,
} from './schemas.js';
import type { CvTypesService } from './service.js';

/** Where the CV types are sent: like the CV workshop, a route allowed a body larger than 100 kB (EF-CVX-39). */
export const CV_TYPES_PATH = '/cv-types';
// The base64 of a 5 MB CV and the JSON around it: a larger body is refused by the parser, before any decoding.
const JSON_ENVELOPE_BYTES = 1024;
export const CV_TYPES_BODY_LIMIT = CV_MAX_BASE64_LENGTH + JSON_ENVELOPE_BYTES;

const TAG = ['Veille'];

/** The reading routes: the list of the CV types and what was deduced from one (EF-CVX-39, EF-VEI-45). */
const registerReadingDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: CV_TYPES_PATH,
    summary: 'CV types',
    description:
      'EF-CVX-39. Jusqu’à 4 CV types : libellé, années d’expérience et niveau déduits (RG-28, RG-29). Jamais le ' +
      'fichier ni son texte (ENF-RGP-14).',
    responses: { 200: jsonResponse('CV types', CvTypeListSchema), ...errorResponses(401) },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: `${CV_TYPES_PATH}/{id}/deduction`,
    summary: 'Profil déduit d’un CV type, à valider',
    description:
      'EF-VEI-43, EF-VEI-45, EF-VEI-46. Les années comptées par le code à partir des périodes du CV, le niveau qui ' +
      'en découle (RG-28) et de 1 à 5 offres types proposées par le modèle, au format des cibles. Rien n’en est ' +
      'retenu avant la validation ; le résultat s’efface 30 minutes après la lecture (404 ensuite, ou pour un autre ' +
      'compte).',
    request: { params: CvTypeIdParamsSchema },
    responses: {
      200: jsonResponse('Profil déduit', ProfileDeductionSchema),
      ...errorResponses(400, 401, 404),
    },
  });
};

/** The routes that change the CV types: import, replacement, deletion (EF-CVX-39 to EF-CVX-42). */
const registerChangeDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'post',
    path: CV_TYPES_PATH,
    summary: 'Importer un CV type',
    description:
      'EF-CVX-39, EF-CVX-40, EF-CVX-43, EF-CVX-44. Le PDF (5 Mo au plus, en base64) est vérifié, puis lu dans la ' +
      'file d’exécution — les pages sans texte par OCR sur le serveur — avec les contrôles de l’Atelier CV, et le ' +
      'profil en est déduit (le modèle local en premier). Répond aussitôt l’identifiant de l’exécution, suivie par ' +
      '/api/jobs/stream. 409 au-delà de 4 CV types, 429 au-delà de 5 lectures par jour.',
    request: { body: jsonBody(ImportCvTypeBodySchema) },
    responses: {
      202: jsonResponse('Lecture en file', StartedAnalysisSchema),
      ...errorResponses(400, 401, 409, 413, 429),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'put',
    path: `${CV_TYPES_PATH}/{id}`,
    summary: 'Remplacer le fichier d’un CV type',
    description:
      'EF-CVX-41. Le nouveau PDF est lu dans la file d’exécution ; ce qui avait été déduit de l’ancien est ' +
      'effacé. Un fichier illisible laisse le CV type comme il était.',
    request: { params: CvTypeIdParamsSchema, body: jsonBody(ReplaceCvTypeBodySchema) },
    responses: {
      202: jsonResponse('Lecture en file', StartedAnalysisSchema),
      ...errorResponses(400, 401, 404, 413, 429),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'delete',
    path: `${CV_TYPES_PATH}/{id}`,
    summary: 'Supprimer un CV type',
    description:
      'EF-CVX-42, ENF-RGP-02. Plus aucune ligne pour ce CV ; les critères qu’il a servi à valider restent.',
    request: { params: CvTypeIdParamsSchema },
    responses: { 204: { description: 'CV type supprimé' }, ...errorResponses(400, 401, 404) },
  });
};

/**
 * The CV types, behind the session guard: each candidate sees only their own (EF-AUT-06).
 * @req EF-CVX-39, EF-CVX-40, EF-CVX-41, EF-CVX-42
 */
export const createCvTypesModule = (service: CvTypesService): ApiModule => {
  const router = Router();

  router.get(
    CV_TYPES_PATH,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.list(currentUserId(res)));
    }),
  );

  router.post(
    CV_TYPES_PATH,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: ImportCvTypeBodySchema });
      res.status(202).json({ runId: await service.startImport(currentUserId(res), body) });
    }),
  );

  router.put(
    `${CV_TYPES_PATH}/:id`,
    asyncHandler(async (req, res) => {
      const { params, body } = validate(req, { params: CvTypeIdParamsSchema, body: ReplaceCvTypeBodySchema });
      res.status(202).json({ runId: await service.startReplacement(currentUserId(res), params.id, body) });
    }),
  );

  router.get(
    `${CV_TYPES_PATH}/:id/deduction`,
    asyncHandler((req, res) => {
      const { params } = validate(req, { params: CvTypeIdParamsSchema });
      res.status(200).json(service.findDeduction(currentUserId(res), params.id));
      return Promise.resolve();
    }),
  );

  router.delete(
    `${CV_TYPES_PATH}/:id`,
    asyncHandler(async (req, res) => {
      const { params } = validate(req, { params: CvTypeIdParamsSchema });
      await service.remove(currentUserId(res), params.id);
      res.status(204).end();
    }),
  );

  return {
    router,
    registerDocs: (registry) => {
      registerReadingDocs(registry);
      registerChangeDocs(registry);
    },
  };
};
