/**
 * Operational error carrying an HTTP status and a message safe to show to the user (in French).
 * The central error handler exposes `message` and `details` as-is; anything that is not an HttpError
 * is masked behind a generic 500 (ENF-SEC-08).
 * @req ENF-SEC-04, ENF-SEC-08
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly details: readonly ValidationIssue[];

  constructor(statusCode: number, message: string, details: readonly ValidationIssue[] = []) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** One rejected field: dotted path from the request part (`body.note`, `params.id`) and the reason. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Requested resource does not exist (404).
 * @req ENF-SEC-04
 */
export class NotFoundError extends HttpError {
  constructor(message = 'Ressource introuvable') {
    super(404, message);
  }
}

/**
 * Request data rejected by its schema (400), with one issue per invalid field.
 * @req ENF-SEC-04
 */
export class ValidationError extends HttpError {
  constructor(details: readonly ValidationIssue[]) {
    super(400, 'Données invalides', details);
  }
}

/**
 * No AI provider could perform a task: every provider of its route failed, timed out or answered outside the
 * schema (502, EF-IA-04). The message tells the user to retry later; the reasons are in `llm_calls`.
 * @req EF-IA-04
 */
export class LlmUnavailableError extends HttpError {
  constructor() {
    super(502, 'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.');
  }
}
