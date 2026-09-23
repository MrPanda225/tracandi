import type { ErrorRequestHandler } from 'express';
import { isDatabaseUnreachable } from './db-errors.js';
import { HttpError } from './errors.js';
import type { Logger } from './logger.js';

const INTERNAL_ERROR = { status: 500, message: 'Erreur interne du serveur' } as const;
// ENF-FIA-01: the hosted database was unreachable; the request is worth trying again, unlike a real failure.
const DATABASE_UNREACHABLE = {
  status: 503,
  message: 'La base de données est momentanément injoignable. Réessayez dans quelques instants.',
} as const;

interface BodyParserError {
  type: string;
  status: number;
}

// Errors raised by express.json(): malformed JSON, body too large, unsupported charset.
const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error &&
  typeof Reflect.get(error, 'type') === 'string' &&
  typeof Reflect.get(error, 'status') === 'number';

const BODY_PARSER_MESSAGES: Record<string, string> = {
  'entity.parse.failed': 'Corps JSON invalide',
  'entity.too.large': 'Corps de requête trop volumineux',
};

interface ErrorResponse {
  status: number;
  body: { error: string; details?: readonly unknown[] };
}

const toErrorResponse = (error: unknown): ErrorResponse | undefined => {
  if (error instanceof HttpError) {
    const details = error.details.length > 0 ? { details: error.details } : {};
    return { status: error.statusCode, body: { error: error.message, ...details } };
  }
  if (isBodyParserError(error)) {
    return { status: error.status, body: { error: BODY_PARSER_MESSAGES[error.type] ?? 'Requête invalide' } };
  }
  if (isDatabaseUnreachable(error)) {
    return { status: DATABASE_UNREACHABLE.status, body: { error: DATABASE_UNREACHABLE.message } };
  }
  return undefined;
};

/**
 * Central error handler. Operational errors (HttpError, body parsing, database unreachable) are answered with their
 * status and French message; any other error is logged (sanitized) and masked behind a generic 500 (ENF-SEC-08).
 * A failure answered as 503 is logged too: it says the hosted database was down, which the journal must keep.
 * Express recognizes error handlers by their four parameters, hence the file-level `max-params` override.
 * @req ENF-SEC-04, ENF-SEC-08
 */
export const handleErrors =
  (logger: Logger): ErrorRequestHandler =>
  (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const known = toErrorResponse(error);
    if (known) {
      if (known.status === DATABASE_UNREACHABLE.status) {
        logger.error('database unreachable', { method: req.method, path: req.path, error });
      }
      res.status(known.status).json(known.body);
      return;
    }
    logger.error('unexpected error', {
      method: req.method,
      path: req.path,
      error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(INTERNAL_ERROR.status).json({ error: INTERNAL_ERROR.message });
  };
