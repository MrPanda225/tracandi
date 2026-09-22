const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * Tells why a PostgreSQL connection string is not acceptable, or returns `null` when it is.
 * A remote database (Neon) requires `sslmode=verify-full` (ENF-SEC-15); a loopback database (local test database,
 * ADR-12) may be reached without TLS. The reason never contains the URL itself, which carries a password.
 * @req ENF-SEC-15
 */
export const describeDatabaseUrlProblem = (connectionString: string): string | null => {
  if (!URL.canParse(connectionString)) return 'is not a valid URL';
  const url = new URL(connectionString);
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) return 'must use the postgresql:// scheme';
  if (LOOPBACK_HOSTS.has(url.hostname)) return null;
  return url.searchParams.get('sslmode') === 'verify-full'
    ? null
    : 'must contain sslmode=verify-full (ENF-SEC-15)';
};
