import { validate as isCronExpression } from 'node-cron';
import { z } from 'zod';
import { describeDatabaseUrlProblem } from '../db/url.js';
import { parseEncryptionKey } from '../lib/crypto.js';
import { type EnabledFeatures, OPTIONAL_FEATURES } from '../lib/features.js';
import type { ProviderName } from '../llm/types.js';

const DEFAULT_HOST = '127.0.0.1';
// EF-GML-03: every 30 minutes, Paris time (EF-VEI-06).
const DEFAULT_TIMEZONE = 'Europe/Paris';
const DEFAULT_GMAIL_CRON = '*/30 * * * *';
// EF-VEI-06: the watch reads its sources at 7, 13 and 19 o'clock, Paris time.
const DEFAULT_WATCH_CRON = '0 7,13,19 * * *';
const DEFAULT_PORT = 4000;
const MAX_PROXY_HOPS = 5;
// EF-EXE-06: beyond this, a single small container could not hold the treatments anyway.
const MAX_JOB_SLOTS = 5;
const MAX_PORT = 65_535;

const isHttpOrigin = (value: string): boolean => {
  // Zod still runs refinements after a failed `url()` check: never let `new URL` throw here.
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
};

// Any name the runtime knows, aliases included (America/Montreal): the formatter refuses the others.
const isTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone: value });
    return true;
  } catch {
    return false;
  }
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
  // RG-13 (v1.8): three Groq slots, tried in this order; the model of each one is free to change.
  GROQ_API_KEY: optionalValue,
  GROQ_MODEL_1: optionalValue,
  GROQ_MODEL_2: optionalValue,
  GROQ_MODEL_3: optionalValue,
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
  // EF-GML-03: time zone of the cron expressions (IANA name) and schedule of the Gmail synchronisation.
  SCHEDULER_TIMEZONE: z.string().refine(isTimeZone, 'must be an IANA time zone').default(DEFAULT_TIMEZONE),
  CRON_GMAIL: z.string().refine(isCronExpression, 'must be a cron expression').default(DEFAULT_GMAIL_CRON),
  // EF-VEI-06
  CRON_SCRAPER: z.string().refine(isCronExpression, 'must be a cron expression').default(DEFAULT_WATCH_CRON),
  /*
   * ENF-COL-03: address a watched site can write to, carried by every collection request. Left empty, the watch
   * refuses to read a site rather than reading it anonymously; the rest of the application is unaffected.
   */
  SCRAPER_CONTACT_EMAIL: z
    .string()
    .trim()
    .email()
    .or(z.literal(''))
    .default('')
    .transform((value) => value || null),
  /*
   * BES-39: proxies standing in front of the API — 2 on the hosting (Vercel's rewrite, then Northflank's load
   * balancer). The client address is then read from X-Forwarded-For, so that the rate limits count each visitor
   * rather than the proxy they share (ENF-SEC-19). 0 in local use: the header is ignored, nobody can forge it.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(MAX_PROXY_HOPS).default(0),
  // EF-EXE-06: long treatments run at once on the whole server; 1 keeps a small container within its memory.
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(MAX_JOB_SLOTS).default(1),
  // ENF-MAI-07: comma-separated optional features (watch, cv); none when absent, an unknown name stops the server.
  ENABLED_FEATURES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(OPTIONAL_FEATURES)))
    .transform((names): EnabledFeatures => new Set(names)),
});

type Env = z.infer<typeof EnvSchema>;

/** The model of each Groq slot, in the order of RG-13; an empty slot leaves its route entry out (EF-IA-05). */
const groqModelsOf = (env: Env): Partial<Record<ProviderName, string>> => ({
  ...(env.GROQ_MODEL_1 ? { groq_1: env.GROQ_MODEL_1 } : {}),
  ...(env.GROQ_MODEL_2 ? { groq_2: env.GROQ_MODEL_2 } : {}),
  ...(env.GROQ_MODEL_3 ? { groq_3: env.GROQ_MODEL_3 } : {}),
});

/** EF-IA-05: at least one key, and every configured key needs the name of the model it serves. */
const requireAiProviders = (env: Env, context: z.RefinementCtx): void => {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY && !env.GROQ_API_KEY) {
    issue('ANTHROPIC_API_KEY, GEMINI_API_KEY or GROQ_API_KEY', 'at least one AI key is required');
  }
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_MODEL) {
    issue('ANTHROPIC_MODEL', 'required with ANTHROPIC_API_KEY');
  }
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) issue('GEMINI_MODEL', 'required with GEMINI_API_KEY');
  if (env.GROQ_API_KEY && Object.keys(groqModelsOf(env)).length === 0) {
    issue('GROQ_MODEL_1, GROQ_MODEL_2 or GROQ_MODEL_3', 'at least one model is required with GROQ_API_KEY');
  }
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
  /** EF-GML-03 */
  scheduler: SchedulerConfig;
  scraper: ScraperConfig;
  /** ENF-MAI-07: optional features this deployment runs. */
  features: EnabledFeatures;
  /** BES-39, ENF-SEC-19: proxies in front of the API whose X-Forwarded-For is trusted; 0 trusts none. */
  trustProxyHops: number;
  /** EF-EXE-06: long treatments run at once, all candidates together. */
  maxConcurrentJobs: number;
}

/** Time zone of the cron expressions and schedule of each job. */
export interface SchedulerConfig {
  timezone: string;
  gmailCron: string;
  /** EF-VEI-06 */
  watchCron: string;
}

/** ENF-COL-03: how the collector identifies itself to the sites it reads. */
export interface ScraperConfig {
  /** Address a site owner can write to; null leaves the watch unable to read anything. */
  contact: string | null;
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
 * COOKIE_SECURE true, Paris time, Gmail every 30 minutes). Secrets are read from the environment only, never from the repository (ENF-SEC-03).
 * @throws ConfigError when a variable is missing or invalid, or when no AI key is set; the server must then stop.
 * No optional feature is enabled unless ENABLED_FEATURES names it.
 * @req ENF-SEC-03, ENF-SEC-08, ENF-SEC-11, ENF-SEC-15, EF-IA-05, EF-GML-03, ENF-MAI-07
 */
export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const result = EnvSchema.superRefine(requireAiProviders).safeParse(env);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => `${issue.path.join('.')} (${issue.message})`);
    throw new ConfigError(`Invalid environment variables: ${reasons.join(', ')}`);
  }
  const { HOST, PORT, FRONTEND_ORIGIN, DATABASE_URL_APP, COOKIE_SECURE } = result.data;
  const {
    ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
  } = result.data;
  const groqModels = groqModelsOf(result.data);
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
      ...(GROQ_API_KEY
        ? Object.fromEntries(
            Object.entries(groqModels).map(([name, model]) => [name, { apiKey: GROQ_API_KEY, model }]),
          )
        : {}),
    },
    gmail: {
      clientId: result.data.GOOGLE_CLIENT_ID,
      clientSecret: result.data.GOOGLE_CLIENT_SECRET,
      redirectUri: result.data.GOOGLE_REDIRECT_URI,
      tokenEncryptionKey: result.data.TOKEN_ENCRYPTION_KEY,
    },
    scheduler: {
      timezone: result.data.SCHEDULER_TIMEZONE,
      gmailCron: result.data.CRON_GMAIL,
      watchCron: result.data.CRON_SCRAPER,
    },
    scraper: { contact: result.data.SCRAPER_CONTACT_EMAIL },
    features: result.data.ENABLED_FEATURES,
    trustProxyHops: result.data.TRUST_PROXY,
    maxConcurrentJobs: result.data.MAX_CONCURRENT_JOBS,
  };
};
