/** Structured context attached to a log entry. */
export type LogContext = Record<string, unknown>;

/** Minimal structured logger: one JSON line per entry, sanitized before writing (ENF-SEC-08). */
export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

interface LoggerOptions {
  /** Output sink, one call per JSON line (defaults to stdout). */
  write?: (line: string) => void;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

const REDACTED = '[REDACTED]';
const TRUNCATED = '[TRUNCATED]';
const MAX_DEPTH = 6;

// ENF-SEC-08: keys whose value is a secret, a token or a message body, whatever the nesting level.
const SENSITIVE_KEY =
  /password|passwd|secret|token|api[-_]?key|authori[sz]ation|cookie|credential|private[-_]?key|^body$|(database|connection)[-_]?(url|string)/i;
// ENF-SEC-08: "scheme://user:password@host" → "scheme://[REDACTED]@host" (database URLs in driver errors).
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

const scrubText = (text: string): string => text.replace(URL_CREDENTIALS, `$1${REDACTED}@`);

const sanitizeAtDepth = (value: unknown, depth: number): unknown => {
  if (typeof value === 'string') return scrubText(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (value instanceof Error) return { name: value.name, message: scrubText(value.message) };
  if (Array.isArray(value)) return value.map((item: unknown) => sanitizeAtDepth(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : sanitizeAtDepth(item, depth + 1),
    ]),
  );
};

/**
 * Returns a copy of `value` safe to log: sensitive keys redacted at any depth, credentials removed from URLs
 * embedded in strings, errors reduced to name and message. Never mutates its input.
 * @req ENF-SEC-08
 */
export const sanitize = (value: unknown): unknown => sanitizeAtDepth(value, 0);

/**
 * Creates a logger writing one sanitized JSON line per entry (`level`, `time` in UTC ISO 8601, `message`, context).
 * Never throws on unusual context values: nested objects beyond a fixed depth are truncated.
 * @req ENF-SEC-08
 */
export const createLogger = (options: LoggerOptions = {}): Logger => {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? (() => new Date());
  const log =
    (level: string) =>
    (message: string, context: LogContext = {}) => {
      const entry = {
        level,
        time: now().toISOString(),
        message: scrubText(message),
        ...(sanitize(context) as LogContext),
      };
      write(JSON.stringify(entry));
    };
  return { info: log('info'), warn: log('warn'), error: log('error') };
};
