/** Base URL of the API: proxied `/api` in development (vite.config.ts), absolute URL in the Docker image. */
const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api';

/** Address of a route of the API, for what does not go through `request()` — un flux d'événements par exemple. */
export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;

export const UNREACHABLE_MESSAGE = 'API injoignable : vérifiez que le serveur Tracandi est démarré.';
const GENERIC_MESSAGE = 'Une erreur inattendue est survenue.';

/** One rejected field, as returned by the API (`details`). */
export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * Failed API call. `status` is 0 when the API could not be reached. `message` is always readable French,
 * ready to display (api-conventions: one entry point handles errors).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details: readonly FieldIssue[];

  constructor(status: number, message: string, details: readonly FieldIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** True for a request cancelled by its AbortController (screen left, newer request sent): nothing to show. */
export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

/** Readable French message of any failure, ready to display. */
export const messageOf = (error: unknown): string => (error instanceof ApiError ? error.message : GENERIC_MESSAGE);

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

const isErrorBody = (value: unknown): value is { error: string; details?: FieldIssue[] } =>
  typeof value === 'object' && value !== null && typeof (value as { error?: unknown }).error === 'string';

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/**
 * Single entry point to the API: sends the session cookie, declares every write as JSON (ENF-SEC-12),
 * parses the response and turns any failure into an ApiError with a French message.
 * The returned value is typed by the caller and must match the API's documented schema (/api/docs).
 */
export async function request<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: method === 'GET' ? { Accept: 'application/json' } : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, UNREACHABLE_MESSAGE);
  }
  const payload = await readJson(response);
  if (!response.ok) {
    throw isErrorBody(payload)
      ? new ApiError(response.status, payload.error, payload.details ?? [])
      : new ApiError(response.status, GENERIC_MESSAGE);
  }
  return payload as T;
}
