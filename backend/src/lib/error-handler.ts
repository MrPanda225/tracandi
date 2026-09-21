import type { ErrorRequestHandler } from 'express';
import { HttpError } from './errors.js';
import type { Logger } from './logger.js';

const INTERNAL_ERROR = { status: 500, message: 'Erreur interne du serveur' } as const;

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
  return undefined;
};

/**
 * Central error handler. Operational errors (HttpError, body parsing) are answered with their status and French
 * message; any other error is logged (sanitized) and masked behind a generic 500 (ENF-SEC-08).
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
