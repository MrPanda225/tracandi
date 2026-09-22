import { performance } from 'node:perf_hooks';
import type { RequestHandler, Response } from 'express';
import { readCookie } from './cookies.js';
import { asyncHandler } from './http.js';
import { SESSION_COOKIE_NAME } from './openapi.js';
import { HttpError, NotFoundError } from './errors.js';
import type { Logger } from './logger.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JSON_MEDIA_TYPE = 'application/json';

const mediaTypeOf = (contentType: string | undefined): string =>
  (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

/**
 * Rejects with 403 any cross-origin request whose `Origin` differs from the interface origin, before any handler runs.
 * Same-origin requests (the API's own pages, such as the Swagger UI) and requests without `Origin` (navigation,
 * command-line tools on the loopback) are let through: a browser never lets another site forge this header.
 * @req ENF-SEC-11
 */
export const rejectForeignOrigin =
  (allowedOrigin: string): RequestHandler =>
  (req, _res, next) => {
    const origin = req.headers.origin;
    const ownOrigin = `${req.protocol}://${req.get('host') ?? ''}`;
    const isAllowed = origin === undefined || origin === allowedOrigin || origin === ownOrigin;
    next(isAllowed ? undefined : new HttpError(403, 'Origine non autorisée'));
  };

/**
 * Session guard: resolves the session cookie to a user and stores it in `res.locals.userId`; otherwise 401.
 * @req EF-AUT-05, EF-AUT-07
 */
export const requireSession = (authenticate: (token: string) => Promise<number | null>): RequestHandler =>
  asyncHandler(async (req, res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    const userId = token ? await authenticate(token) : null;
    if (userId === null) throw new HttpError(401, 'Authentification requise');
    res.locals.userId = userId;
    next();
  });

/**
 * User of the current request, set by `requireSession`.
 * @throws HttpError 401 when called on a route that is not behind the session guard.
 * @req EF-AUT-06
 */
export const currentUserId = (res: Response): number => {
  const { userId } = res.locals;
  if (userId === undefined) throw new HttpError(401, 'Authentification requise');
  return userId;
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
