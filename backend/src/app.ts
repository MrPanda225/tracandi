import cors from 'cors';
import express, { Router, type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { Config } from './config/env.js';
import { handleErrors } from './lib/error-handler.js';
import type { Logger } from './lib/logger.js';
import {
  logRequests,
  notFound,
  rejectForeignOrigin,
  requireJsonForWrites,
  requireSession,
} from './lib/middleware.js';
import type { ApiModule } from './lib/module.js';
import {
  buildOpenApiDocument,
  createOpenApiRegistry,
  jsonResponse,
  type OpenAPIRegistry,
  z,
} from './lib/openapi.js';
import { CV_UPLOAD_BODY_LIMIT, CV_UPLOAD_PATH } from './modules/cvWorkshop/routes.js';
import { CV_TYPES_BODY_LIMIT, CV_TYPES_PATH } from './modules/cvTypes/routes.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const JSON_BODY_LIMIT = '100kb';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Dependencies of the HTTP application, injected so that tests never open a port nor touch real services. */
export interface AppOptions {
  /** `trustProxyHops`: proxies in front of the API (BES-39); none when absent. */
  config: Pick<Config, 'frontendOrigin'> & Partial<Pick<Config, 'trustProxyHops'>>;
  logger: Logger;
  /** Resolves a session token to its user, or null (EF-AUT-05). */
  authenticate: (token: string) => Promise<number | null>;
  /** Feature modules mounted under `/api`: public ones first, then the others behind the session guard. */
  modules?: readonly ApiModule[];
}

const registerHealthDocs = (registry: OpenAPIRegistry): void => {
  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Système'],
    summary: "État de l'API",
    responses: { 200: jsonResponse('API disponible', z.object({ status: z.literal('ok') })) },
  });
};

const createApiRouter = ({ authenticate, modules = [] }: AppOptions): Router => {
  const registry = createOpenApiRegistry();
  registerHealthDocs(registry);
  for (const module of modules) module.registerDocs(registry);
  const document = buildOpenApiDocument(registry);

  const api = Router();
  api.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  // EF-DOC-01, EF-DOC-02: public documentation.
  api.get('/openapi.json', (_req, res) => {
    res.status(200).json(document);
  });
  api.use('/docs', swaggerUi.serve, swaggerUi.setup(document, { customSiteTitle: 'Tracandi API' }));
  for (const module of modules.filter((candidate) => candidate.isPublic)) api.use(module.router);
  // EF-AUT-05: everything mounted below requires a valid session.
  api.use(requireSession(authenticate));
  for (const module of modules.filter((candidate) => !candidate.isPublic)) api.use(module.router);
  return api;
};

/**
 * Assembles the Express application: security headers, request log, rate limit, origin guard, CORS, JSON-only guard,
 * JSON body parsing, `/api` (health, documentation, public modules, session guard, protected modules), JSON 404 and
 * central error handler — in this order, so that a rejected request never reaches a handler. Does not listen on any port.
 * @req ENF-SEC-08, ENF-SEC-11, ENF-SEC-12, EF-AUT-05, EF-DOC-01, EF-DOC-02
 */
export const createApp = (options: AppOptions): Express => {
  const { config, logger } = options;
  const app = express();
  // BES-39, ENF-SEC-19: behind the hosting proxies, the client is the address they forward, not the last proxy.
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(logRequests(logger));
  app.use(
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      limit: RATE_LIMIT_MAX_REQUESTS,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Trop de requêtes, réessayez dans une minute' },
    }),
  );
  app.use(rejectForeignOrigin(config.frontendOrigin));
  // `credentials`: the interface sends the session cookie with each request (ADR-09).
  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
      methods: ALLOWED_METHODS,
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(requireJsonForWrites);
  // EF-CVX-21: the CV workshop receives a PDF of up to 5 MB in base64; every other route keeps 100 kB. Parsed here
  // first, its body is left alone by the general parser.
  // Only the routes that receive a file: a GET or a DELETE of the same prefix keeps the limit of 100 kB.
  app.post(`/api${CV_UPLOAD_PATH}`, express.json({ limit: CV_UPLOAD_BODY_LIMIT }));
  // EF-CVX-39: the CV types are sent the same way, as a PDF of up to 5 MB in base64: to import one, to replace one.
  app.post(`/api${CV_TYPES_PATH}`, express.json({ limit: CV_TYPES_BODY_LIMIT }));
  app.put(`/api${CV_TYPES_PATH}/:id`, express.json({ limit: CV_TYPES_BODY_LIMIT }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', createApiRouter(options));
  app.use(notFound);
  app.use(handleErrors(logger));
  return app;
};
