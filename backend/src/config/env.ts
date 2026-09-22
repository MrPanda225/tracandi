import { z } from 'zod';
import { describeDatabaseUrlProblem } from '../db/url.js';
import { parseEncryptionKey } from '../lib/crypto.js';
import type { ProviderName } from '../llm/types.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;
const MAX_PORT = 65_535;

const isHttpOrigin = (value: string): boolean => {
  // Zod still runs refinements after a failed `url()` check: never let `new URL` throw here.
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
};

// A line `KEY=` left empty in .env counts as absent.
const optionalValue = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

// Variables used by the tasks already delivered; each later task extends this schema (YAGNI).
const EnvSchema = z.object({
  // ENF-SEC-01: loopback by default; 0.0.0.0 only inside the container, whose port is published on 127.0.0.1.
  HOST: z.union([z.string().ip(), z.literal('localhost')]).default(DEFAULT_HOST),
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  // ENF-SEC-11: exact origin of the interface, the only one allowed to call the API.
  FRONTEND_ORIGIN: z.string().url().refine(isHttpOrigin, 'must be an http(s) origin without path'),
  // ENF-SEC-15, ENF-SEC-17: application role only, TLS verified for a remote database.
  DATABASE_URL_APP: z.string().superRefine((value, context) => {
    const problem = describeDatabaseUrlProblem(value);
    if (problem) context.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }),
  // ADR-09: browsers accept Secure cookies on http://127.0.0.1 and http://localhost.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  // EF-IA-05: one AI key is enough; each configured provider needs its model (never hard-coded, rules/llm.md).
  ANTHROPIC_API_KEY: optionalValue,
  ANTHROPIC_MODEL: optionalValue,
  GEMINI_API_KEY: optionalValue,
  GEMINI_MODEL: optionalValue,
  // EF-GML-01: OAuth client of the Google Cloud project, for the Gmail connection from the interface.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
  // ENF-SEC-02: key of the refresh tokens at rest (`openssl rand -hex 32`).
  TOKEN_ENCRYPTION_KEY: z.string().transform((value, context) => {
    try {
      return parseEncryptionKey(value);
    } catch (error) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: (error as Error).message });
      return z.NEVER;
    }
  }),
});

const requireAiProviders = (env: z.infer<typeof EnvSchema>, context: z.RefinementCtx): void => {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY) {
    issue('ANTHROPIC_API_KEY or GEMINI_API_KEY', 'at least one AI key is required');
  }
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_MODEL)
    issue('ANTHROPIC_MODEL', 'required with ANTHROPIC_API_KEY');
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) issue('GEMINI_MODEL', 'required with GEMINI_API_KEY');
};

/** Key and model of one AI provider. */
export interface LlmProviderConfig {
  apiKey: string;
  model: string;
}

/** Validated runtime configuration. */
export interface Config {
  host: string;
  port: number;
  frontendOrigin: string;
  databaseUrl: string;
  isCookieSecure: boolean;
  /** Configured AI providers only (EF-IA-05). */
  llm: Partial<Record<ProviderName, LlmProviderConfig>>;
  /** EF-GML-01, ENF-SEC-02 */
  gmail: GmailConfig;
}

/** OAuth client of the Gmail connection and key of the tokens at rest. */
export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: Buffer;
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
 * Validates the environment and returns the configuration, applying defaults (HOST 127.0.0.1, PORT 4000,
 * COOKIE_SECURE true). Secrets are read from the environment only, never from the repository (ENF-SEC-03).
 * @throws ConfigError when a variable is missing or invalid, or when no AI key is set; the server must then stop.
 * @req ENF-SEC-03, ENF-SEC-08, ENF-SEC-11, ENF-SEC-15, EF-IA-05
 */
export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const result = EnvSchema.superRefine(requireAiProviders).safeParse(env);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => `${issue.path.join('.')} (${issue.message})`);
    throw new ConfigError(`Invalid environment variables: ${reasons.join(', ')}`);
  }
  const { HOST, PORT, FRONTEND_ORIGIN, DATABASE_URL_APP, COOKIE_SECURE } = result.data;
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, GEMINI_API_KEY, GEMINI_MODEL } = result.data;
  return {
    host: HOST,
    port: PORT,
    frontendOrigin: FRONTEND_ORIGIN,
    databaseUrl: DATABASE_URL_APP,
    isCookieSecure: COOKIE_SECURE,
    llm: {
      ...(ANTHROPIC_API_KEY && ANTHROPIC_MODEL
        ? { claude: { apiKey: ANTHROPIC_API_KEY, model: ANTHROPIC_MODEL } }
        : {}),
      ...(GEMINI_API_KEY && GEMINI_MODEL ? { gemini: { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL } } : {}),
    },
    gmail: {
      clientId: result.data.GOOGLE_CLIENT_ID,
      clientSecret: result.data.GOOGLE_CLIENT_SECRET,
      redirectUri: result.data.GOOGLE_REDIRECT_URI,
      tokenEncryptionKey: result.data.TOKEN_ENCRYPTION_KEY,
    },
  };
};
