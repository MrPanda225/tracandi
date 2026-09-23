const UNIQUE_VIOLATION = '23505';
/**
 * Failures of a database that cannot be reached: the pool gave up before a connection, the host refused it or the
 * network dropped. `pg` reports them by their system code, except the timeout of the pool, which has a message.
 */
const UNREACHABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now (the server is starting up)
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
]);
/**
 * Failures a hosted database causes without any system code: `pg` reports them as plain messages. Neon suspends and
 * recycles its computes, so a connection handed out by the pool may already be dead.
 */
const UNREACHABLE_MESSAGES = [
  'timeout exceeded when trying to connect',
  'connection terminated',
  'connection ended unexpectedly',
  'is not queryable',
  'socket hang up',
  'server closed the connection',
  'terminating connection',
  'connection refused',
];

const codeOf = (error: unknown): unknown =>
  error instanceof Error ? (Reflect.get(error, 'code') ?? codeOf(Reflect.get(error, 'cause'))) : undefined;

/**
 * Tells whether a database error is a unique constraint violation, whether it comes directly from `pg`
 * or wrapped by Drizzle (`cause`). Lets services turn it into a 409 (api-conventions).
 * @req ENF-SEC-04
 */
export const isUniqueViolation = (error: unknown): boolean => codeOf(error) === UNIQUE_VIOLATION;

const messagesOf = (error: unknown): string[] =>
  error instanceof Error
    ? [error.message, ...messagesOf(Reflect.get(error, 'cause'))]
    : [];

/**
 * Tells whether a failure means the database could not be reached at all — a hosted database asleep, restarting,
 * recycling its connections or cut off — rather than a query the database refused. Lets the API answer 503 with a
 * readable message instead of a masked 500 (api-conventions).
 * @req ENF-SEC-04, ENF-FIA-01
 */
export const isDatabaseUnreachable = (error: unknown): boolean => {
  const code = codeOf(error);
  if (typeof code === 'string' && UNREACHABLE_CODES.has(code)) return true;
  const wording = messagesOf(error).join(' ').toLowerCase();
  return UNREACHABLE_MESSAGES.some((message) => wording.includes(message));
};
