const UNIQUE_VIOLATION = '23505';

const codeOf = (error: unknown): unknown =>
  error instanceof Error ? (Reflect.get(error, 'code') ?? codeOf(Reflect.get(error, 'cause'))) : undefined;

/**
 * Tells whether a database error is a unique constraint violation, whether it comes directly from `pg`
 * or wrapped by Drizzle (`cause`). Lets services turn it into a 409 (api-conventions).
 * @req ENF-SEC-04
 */
export const isUniqueViolation = (error: unknown): boolean => codeOf(error) === UNIQUE_VIOLATION;
