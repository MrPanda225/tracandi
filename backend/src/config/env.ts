import { z } from 'zod';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;
const MAX_PORT = 65_535;

const isHttpOrigin = (value: string): boolean => {
  // Zod still runs refinements after a failed `url()` check: never let `new URL` throw here.
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
};

// Variables used by the tasks already delivered; each later task extends this schema (YAGNI).
const EnvSchema = z.object({
  // ENF-SEC-01: loopback by default; 0.0.0.0 only inside the container, whose port is published on 127.0.0.1.
  HOST: z.union([z.string().ip(), z.literal('localhost')]).default(DEFAULT_HOST),
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  // ENF-SEC-11: exact origin of the interface, the only one allowed to call the API.
  FRONTEND_ORIGIN: z.string().url().refine(isHttpOrigin, 'must be an http(s) origin without path'),
});

/** Validated runtime configuration. */
export interface Config {
  host: string;
  port: number;
  frontendOrigin: string;
}

/**
 * Invalid environment. The message names each faulty variable and the reason, never the value,
 * which may be a secret (ENF-SEC-08).
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Validates the environment and returns the configuration, applying defaults (HOST 127.0.0.1, PORT 4000).
 * Secrets are read from the environment only, never from the repository (ENF-SEC-03).
 * @throws ConfigError when a variable is missing or invalid; the server must then stop.
 * @req ENF-SEC-03, ENF-SEC-08, ENF-SEC-11
 */
export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => `${issue.path.join('.')} (${issue.message})`);
    throw new ConfigError(`Invalid environment variables: ${reasons.join(', ')}`);
  }
  const { HOST, PORT, FRONTEND_ORIGIN } = result.data;
  return { host: HOST, port: PORT, frontendOrigin: FRONTEND_ORIGIN };
};
