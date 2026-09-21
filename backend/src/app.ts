import cors from 'cors';
import express, { Router, type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config/env.js';
import { handleErrors } from './lib/error-handler.js';
import type { Logger } from './lib/logger.js';
import { logRequests, notFound, rejectForeignOrigin, requireJsonForWrites } from './lib/middleware.js';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 300;
const JSON_BODY_LIMIT = '100kb';
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Dependencies of the HTTP application, injected so that tests never open a port nor touch real services. */
export interface AppOptions {
  config: Pick<Config, 'frontendOrigin'>;
  logger: Logger;
  /** Module routers mounted under `/api`, in order. */
  routers?: readonly Router[];
}

const createApiRouter = (routers: readonly Router[]): Router => {
  const api = Router();
  api.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });
  for (const router of routers) api.use(router);
  return api;
};

/**
 * Assembles the Express application: security headers, request log, rate limit, origin guard, CORS, JSON-only guard,
 * JSON body parsing, `/api` routes, JSON 404 and central error handler — in this order, so that a rejected request
 * never reaches a handler. Does not listen on any port.
 * @req ENF-SEC-08, ENF-SEC-11, ENF-SEC-12
 */
export const createApp = ({ config, logger, routers = [] }: AppOptions): Express => {
  const app = express();
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
  app.use(
    cors({ origin: config.frontendOrigin, methods: ALLOWED_METHODS, allowedHeaders: ['Content-Type'] }),
  );
  app.use(requireJsonForWrites);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use('/api', createApiRouter(routers));
  app.use(notFound);
  app.use(handleErrors(logger));
  return app;
};
