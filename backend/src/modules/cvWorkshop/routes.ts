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
  AnalysisIdParamsSchema,
  CvAnalysisSchema,
  StartAnalysisBodySchema,
  StartedAnalysisSchema,
} from './schemas.js';
import type { CvWorkshopService } from './service.js';
import { CV_MAX_BASE64_LENGTH } from './upload.js';

/** Where the CV is sent: the only route of the API allowed a body larger than 100 kB. */
export const CV_UPLOAD_PATH = '/cv-workshop/analyses';
// The base64 of a 5 MB CV and the JSON around it: a larger body is refused by the parser, before any decoding.
const JSON_ENVELOPE_BYTES = 1024;
export const CV_UPLOAD_BODY_LIMIT = CV_MAX_BASE64_LENGTH + JSON_ENVELOPE_BYTES;

const TAG = ['Atelier CV'];

const registerDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'post',
    path: CV_UPLOAD_PATH,
    summary: 'Lancer l’analyse d’un CV importé',
    description:
      'EF-CVX-21, EF-CVX-23, EF-CVX-32, EF-CVX-33. Le CV (PDF de 5 Mo au plus, en base64) est vérifié, puis lu ' +
      'dans la file d’exécution — les pages sans texte par OCR sur le serveur — et comparé à l’offre par l’IA, ' +
      'sans ses coordonnées. Répond aussitôt l’identifiant de l’exécution, suivie par /api/jobs/stream. ' +
      '5 analyses par jour (429 au-delà). Rien du CV ni de l’offre n’est enregistré (ENF-RGP-06).',
    request: { body: jsonBody(StartAnalysisBodySchema) },
    responses: {
      202: jsonResponse('Analyse en file', StartedAnalysisSchema),
      ...errorResponses(400, 401, 413, 415, 429),
    },
  });
  registry.registerPath({
    tags: TAG,
    security: SESSION_SECURITY,
    method: 'get',
    path: `${CV_UPLOAD_PATH}/{id}`,
    summary: 'Résultat d’une analyse',
    description:
      'EF-CVX-24, EF-CVX-32, ENF-RGP-06, ENF-RGP-07. Le diagnostic (score global RG-23, quatre sous-scores ' +
      'expliqués, points faibles, compétences manquantes), le texte que l’IA a reçu et les coordonnées mises à ' +
      'part. 404 tant que l’analyse n’est pas finie, 30 minutes après, ou pour un autre compte.',
    request: { params: AnalysisIdParamsSchema },
    responses: { 200: jsonResponse('Résultat de l’analyse', CvAnalysisSchema), ...errorResponses(400, 401, 404) },
  });
};

/**
 * Routes of the CV workshop, behind the session guard: each candidate sees only their own analyses (EF-AUT-06).
 * @req EF-CVX-21, EF-CVX-32, ENF-RGP-06
 */
export const createCvWorkshopModule = (service: CvWorkshopService): ApiModule => {
  const router = Router();

  router.post(
    CV_UPLOAD_PATH,
    asyncHandler(async (req, res) => {
      const { body } = validate(req, { body: StartAnalysisBodySchema });
      const runId = await service.startAnalysis(currentUserId(res), body);
      res.status(202).json({ runId });
    }),
  );

  router.get(
    `${CV_UPLOAD_PATH}/:id`,
    asyncHandler((req, res) => {
      const { params } = validate(req, { params: AnalysisIdParamsSchema });
      res.status(200).json(service.findAnalysis(currentUserId(res), params.id));
      return Promise.resolve();
    }),
  );

  return { router, registerDocs };
};
