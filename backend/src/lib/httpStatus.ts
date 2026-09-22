/** Reads a property of a value that may be anything: the failures of an SDK are external data (clean-code.md). */
export const propertyOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/**
 * HTTP status carried by the failure of an API client, reported as `status` (Anthropic, Google GenAI, googleapis)
 * or as `code`; null when the failure carries none (a network error, an abort, a programming mistake).
 */
export const statusOfError = (error: unknown): number | null => {
  const status = propertyOf(error, 'status') ?? propertyOf(error, 'code');
  return typeof status === 'number' ? status : null;
};

const TOO_MANY_REQUESTS = 429;
const FIRST_SERVER_ERROR = 500;

/**
 * True when the service refused for a reason that passes on its own: too many requests, or a failure on its side.
 * A refusal of the request itself (400, 401, 403, 404) would be refused again in the same terms.
 */
export const isTransientFailure = (error: unknown): boolean => {
  const status = statusOfError(error);
  return status === TOO_MANY_REQUESTS || (status !== null && status >= FIRST_SERVER_ERROR);
};
