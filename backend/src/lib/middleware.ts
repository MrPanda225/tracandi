import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';
import { HttpError, NotFoundError } from './errors.js';
import type { Logger } from './logger.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JSON_MEDIA_TYPE = 'application/json';

const mediaTypeOf = (contentType: string | undefined): string =>
  (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

/**
 * Rejects with 403 any request whose `Origin` header differs from the interface origin, before any handler runs.
 * Requests without `Origin` (same-origin navigation, command-line tools on the loopback) are let through.
 * @req ENF-SEC-11
 */
export const rejectForeignOrigin =
  (allowedOrigin: string): RequestHandler =>
  (req, _res, next) => {
    const origin = req.headers.origin;
    next(
      origin === undefined || origin === allowedOrigin
        ? undefined
        : new HttpError(403, 'Origine non autorisée'),
    );
  };

/**
 * Rejects with 415 every write request (POST, PUT, PATCH, DELETE) not declared as `application/json`,
 * even without a body: an HTML form cannot send this type, which blocks cross-site form submissions.
 * @req ENF-SEC-12
 */
export const requireJsonForWrites: RequestHandler = (req, _res, next) => {
  const isRejected =
    WRITE_METHODS.has(req.method) && mediaTypeOf(req.headers['content-type']) !== JSON_MEDIA_TYPE;
  next(isRejected ? new HttpError(415, 'Le type de contenu doit être application/json') : undefined);
};

/**
 * Logs one entry per completed request with method, path (never the query string, which may carry an OAuth code),
 * status and duration.
 * @req ENF-SEC-08
 */
export const logRequests =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const startedAt = performance.now();
    const { method, path } = req;
    res.on('finish', () => {
      logger.info('request completed', {
        method,
        path,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    next();
  };

/**
 * Turns any request that reached no route into a JSON 404.
 * @req ENF-SEC-04
 */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError());
};
