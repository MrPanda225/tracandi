import { validate as isCronExpression } from 'node-cron';
import { z } from 'zod';
import { describeDatabaseUrlProblem } from '../db/url.js';
import { parseEncryptionKey } from '../lib/crypto.js';
import { type EnabledFeatures, OPTIONAL_FEATURES } from '../lib/features.js';
import { isPrivateHost } from '../lib/privateNetwork.js';
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
// EF-CVX-33: 5 a day by default; a bound keeps a typo from meaning « unlimited » in production.
const DEFAULT_CV_ANALYSES_PER_DAY = 5;
const MAX_CV_ANALYSES_PER_DAY = 1_000;
const MAX_PORT = 65_535;
// EF-IA-10, EF-IA-11 (v1.35): defaults and bounds of the local model; a CPU-only server takes about 40 s per offer.
const DEFAULT_LOCAL_TIMEOUT_MS = 600_000;
const MIN_LOCAL_TIMEOUT_MS = 1_000;
const MAX_LOCAL_TIMEOUT_MS = 3_600_000;
const DEFAULT_LOCAL_MAX_OUTPUT_TOKENS = 2_000;
const MAX_LOCAL_OUTPUT_TOKENS = 32_000;
// EF-IA-12 (v1.35): five offers of 800 characters fit a context of 8 192 tokens with their answer.
// EF-EXE-07 (v1.35): offers scored by one pass for one candidate; the rest waits for the next pass.
const DEFAULT_MAX_SCORED_OFFERS = 20;
const MAX_SCORED_OFFERS = 1_000;
const DEFAULT_LOCAL_BATCH_SIZE = 5;
const MAX_LOCAL_BATCH_SIZE = 50;
const DEFAULT_LOCAL_DESCRIPTION_CHARS = 800;
const MIN_LOCAL_DESCRIPTION_CHARS = 200;
const MAX_LOCAL_DESCRIPTION_CHARS = 5_000;
// Ollama ignores the key it is given; a private address needs none (ENF-SEC-24), a placeholder keeps the header.
const PRIVATE_NETWORK_TOKEN = 'ollama';

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

/**
 * ENF-SEC-24, ENF-MAI-09: why the address of the local model is refused, or null. The reason never quotes the value,
 * which may carry a secret (ENF-SEC-25).
 */
const describeLocalUrlProblem = (value: string): string | null => {
  if (!URL.canParse(value)) return 'must be an address such as http://192.168.1.54:11434/v1';
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'must start with http:// or https://';
  if (url.username || url.password) return 'must not carry credentials: the token has its own variable';
  if (url.search || url.hash) return 'must not carry a query string or a fragment';
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) {
    return 'must use https unless the host is on a private network';
  }
  return null;
};

const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

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
  /*
   * EF-IA-07, ENF-SEC-24, ENF-MAI-09 (v1.35): the model of the operator, an OpenAI-compatible service such as Ollama.
   * Its address, model and token are the server's, never a user's (Q-24); the others are optional with defaults.
   */
  LOCAL_LLM_BASE_URL: optionalValue,
  LOCAL_LLM_MODEL: optionalValue,
  LOCAL_LLM_API_KEY: optionalValue,
  LOCAL_LLM_TIMEOUT_MS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(MIN_LOCAL_TIMEOUT_MS)
      .max(MAX_LOCAL_TIMEOUT_MS)
      .default(DEFAULT_LOCAL_TIMEOUT_MS),
  ),
  LOCAL_LLM_MAX_OUTPUT_TOKENS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(MAX_LOCAL_OUTPUT_TOKENS).default(DEFAULT_LOCAL_MAX_OUTPUT_TOKENS),
  ),
  LOCAL_LLM_BATCH_SIZE: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).max(MAX_LOCAL_BATCH_SIZE).default(DEFAULT_LOCAL_BATCH_SIZE),
  ),
  LOCAL_LLM_DESCRIPTION_CHARS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce
      .number()
      .int()
      .min(MIN_LOCAL_DESCRIPTION_CHARS)
      .max(MAX_LOCAL_DESCRIPTION_CHARS)
      .default(DEFAULT_LOCAL_DESCRIPTION_CHARS),
  ),
  // EF-EXE-07: offers scored per pass and per candidate (AI cost and duration); 0 lifts the limit, for the tests.
  MAX_SCORED_OFFERS_PER_PASS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(0).max(MAX_SCORED_OFFERS).default(DEFAULT_MAX_SCORED_OFFERS),
  ),
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
   * EF-VEI-32, ENF-SEC-23 (v1.33): application registered on francetravail.io, API « Offres d'emploi v2 ». Both or
   * neither: without them the France Travail source says it is not configured, the rest of the watch runs.
   */
  FRANCE_TRAVAIL_CLIENT_ID: optionalValue,
  FRANCE_TRAVAIL_CLIENT_SECRET: optionalValue,
  // EF-VEI-34, ENF-SEC-23 (v1.33): key of the API Apprentissage (La bonne alternance); without it, that source says so.
  LBA_API_KEY: optionalValue,
  /*
   * BES-39: proxies standing in front of the API — 2 on the hosting (Vercel's rewrite, then Northflank's load
   * balancer). The client address is then read from X-Forwarded-For, so that the rate limits count each visitor
   * rather than the proxy they share (ENF-SEC-19). 0 in local use: the header is ignored, nobody can forge it.
   */
  TRUST_PROXY: z.coerce.number().int().min(0).max(MAX_PROXY_HOPS).default(0),
  // EF-EXE-06: long treatments run at once on the whole server; 1 keeps a small container within its memory.
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(MAX_JOB_SLOTS).default(1),
  // EF-CVX-33: analyses of the CV workshop per candidate and per day (AI cost, ENF-COU-01); 0 lifts it, for tests.
  CV_ANALYSES_PER_DAY: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_CV_ANALYSES_PER_DAY)
    .default(DEFAULT_CV_ANALYSES_PER_DAY),
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

/** EF-IA-05: every configured key needs the name of the model it serves. */
const requireModelsOfKeys = (env: Env, issue: (path: string, message: string) => void): void => {
  if (env.ANTHROPIC_API_KEY && !env.ANTHROPIC_MODEL) {
    issue('ANTHROPIC_MODEL', 'required with ANTHROPIC_API_KEY');
  }
  if (env.GEMINI_API_KEY && !env.GEMINI_MODEL) issue('GEMINI_MODEL', 'required with GEMINI_API_KEY');
  if (env.GROQ_API_KEY && Object.keys(groqModelsOf(env)).length === 0) {
    issue('GROQ_MODEL_1, GROQ_MODEL_2 or GROQ_MODEL_3', 'at least one model is required with GROQ_API_KEY');
  }
};

/** ENF-SEC-24, ENF-MAI-09: the local model needs a valid address and a model, and a token off a private network. */
const requireLocalModel = (env: Env, issue: (path: string, message: string) => void): void => {
  if (!env.LOCAL_LLM_BASE_URL) {
    if (env.LOCAL_LLM_MODEL) issue('LOCAL_LLM_BASE_URL', 'required with LOCAL_LLM_MODEL');
    if (env.LOCAL_LLM_API_KEY) issue('LOCAL_LLM_BASE_URL', 'required with LOCAL_LLM_API_KEY');
    return;
  }
  const problem = describeLocalUrlProblem(env.LOCAL_LLM_BASE_URL);
  if (problem) issue('LOCAL_LLM_BASE_URL', problem);
  if (!env.LOCAL_LLM_MODEL) issue('LOCAL_LLM_MODEL', 'required with LOCAL_LLM_BASE_URL');
  if (!problem && !env.LOCAL_LLM_API_KEY && !isPrivateHost(new URL(env.LOCAL_LLM_BASE_URL).hostname)) {
    issue('LOCAL_LLM_API_KEY', 'required for an address outside a private network');
  }
};

/**
 * EF-IA-05: at least one provider (a key, or the local model of v1.35), and every configured key needs the name of
 * the model it serves; the local model has its own rules (requireLocalModel).
 */
const requireAiProviders = (env: Env, context: z.RefinementCtx): void => {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (!env.ANTHROPIC_API_KEY && !env.GEMINI_API_KEY && !env.GROQ_API_KEY && !env.LOCAL_LLM_BASE_URL) {
    issue(
      'ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY or LOCAL_LLM_BASE_URL',
      'at least one AI provider is required',
    );
  }
  requireModelsOfKeys(env, issue);
  requireLocalModel(env, issue);
};

/** ENF-SEC-23: half a pair of credentials is a typing slip, not a choice; the server says so at start. */
const requireCredentialPairs = (env: Env, context: z.RefinementCtx): void => {
  if (Boolean(env.FRANCE_TRAVAIL_CLIENT_ID) !== Boolean(env.FRANCE_TRAVAIL_CLIENT_SECRET)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['FRANCE_TRAVAIL_CLIENT_ID, FRANCE_TRAVAIL_CLIENT_SECRET'],
      message: 'both are required, or neither',
    });
  }
};

/** Key and model of one AI provider. */
export interface LlmProviderConfig {
  apiKey: string;
  model: string;
}

/**
 * The local model of the operator (EF-IA-07, ADR-16). `apiKey` is the token it is presented with (ENF-SEC-24); the
 * address and the token are never shown nor journaled (ENF-SEC-25). The delay and the ceiling are applied by the
 * router (EF-IA-10, EF-IA-11).
 */
export interface LocalLlmConfig extends LlmProviderConfig {
  /** Root of its OpenAI-compatible API, without a trailing slash. */
  baseUrl: string;
  timeoutMs: number;
  maxOutputTokens: number;
  /** EF-IA-12: offers per batch and characters of each description while the local model serves the scoring. */
  batchSize: number;
  descriptionChars: number;
}

/** Configured AI providers: the hosted ones by key and model, and the local model of the operator. */
export type LlmConfig = Partial<Record<Exclude<ProviderName, 'local'>, LlmProviderConfig>> & {
  local?: LocalLlmConfig;
};

/** ENF-SEC-23: credentials of an official API, read from the configuration only. */
export interface OfficialCredentials {
  clientId: string;
  clientSecret: string;
}

/** Validated runtime configuration. */
export interface Config {
  host: string;
  port: number;
  frontendOrigin: string;
  databaseUrl: string;
  isCookieSecure: boolean;
  /** Configured AI providers only (EF-IA-05). */
  llm: LlmConfig;
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
  /** EF-CVX-33: CV analyses a candidate may launch per day; 0 lifts the limit. */
  cvAnalysesPerDay: number;
  /** EF-EXE-07: ceilings of a pass of the watch; 0 offers lifts the limit. */
  watch: { maxScoredOffersPerPass: number };
  /** EF-VEI-32, EF-VEI-34, ENF-SEC-23: null for each official API the server has no credentials for. */
  officialSources: {
    franceTravail: OfficialCredentials | null;
    laBonneAlternance: { apiKey: string } | null;
  };
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

/** EF-IA-07: the local model of the operator, left out when no address and model are configured. */
const localModelOf = (env: Env): { local?: LocalLlmConfig } =>
  env.LOCAL_LLM_BASE_URL && env.LOCAL_LLM_MODEL
    ? {
        local: {
          apiKey: env.LOCAL_LLM_API_KEY ?? PRIVATE_NETWORK_TOKEN,
          model: env.LOCAL_LLM_MODEL,
          baseUrl: withoutTrailingSlash(env.LOCAL_LLM_BASE_URL),
          timeoutMs: env.LOCAL_LLM_TIMEOUT_MS,
          maxOutputTokens: env.LOCAL_LLM_MAX_OUTPUT_TOKENS,
          batchSize: env.LOCAL_LLM_BATCH_SIZE,
          descriptionChars: env.LOCAL_LLM_DESCRIPTION_CHARS,
        },
      }
    : {};

/**
 * Validates the environment and returns the configuration, applying defaults (HOST 127.0.0.1, PORT 4000,
 * COOKIE_SECURE true, Paris time, Gmail every 30 minutes). Secrets are read from the environment only, never from the repository (ENF-SEC-03).
 * @throws ConfigError when a variable is missing or invalid, or when no AI key is set; the server must then stop.
 * No optional feature is enabled unless ENABLED_FEATURES names it.
 * @req ENF-SEC-03, ENF-SEC-08, ENF-SEC-11, ENF-SEC-15, EF-IA-05, EF-IA-07, EF-GML-03, ENF-MAI-07, ENF-MAI-09, ENF-SEC-24
 */
export const loadConfig = (env: Record<string, string | undefined>): Config => {
  const result = EnvSchema.superRefine(requireAiProviders).superRefine(requireCredentialPairs).safeParse(env);
  if (!result.success) {
    const reasons = result.error.issues.map((issue) => `${issue.path.join('.')} (${issue.message})`);
    throw new ConfigError(`Invalid environment variables: ${reasons.join(', ')}`);
  }
  const { HOST, PORT, FRONTEND_ORIGIN, DATABASE_URL_APP, COOKIE_SECURE } = result.data;
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, GEMINI_API_KEY, GEMINI_MODEL, GROQ_API_KEY } = result.data;
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
      ...localModelOf(result.data),
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
    officialSources: {
      franceTravail:
        result.data.FRANCE_TRAVAIL_CLIENT_ID && result.data.FRANCE_TRAVAIL_CLIENT_SECRET
          ? {
              clientId: result.data.FRANCE_TRAVAIL_CLIENT_ID,
              clientSecret: result.data.FRANCE_TRAVAIL_CLIENT_SECRET,
            }
          : null,
      laBonneAlternance: result.data.LBA_API_KEY ? { apiKey: result.data.LBA_API_KEY } : null,
    },
    features: result.data.ENABLED_FEATURES,
    trustProxyHops: result.data.TRUST_PROXY,
    maxConcurrentJobs: result.data.MAX_CONCURRENT_JOBS,
    cvAnalysesPerDay: result.data.CV_ANALYSES_PER_DAY,
    watch: { maxScoredOffersPerPass: result.data.MAX_SCORED_OFFERS_PER_PASS },
  };
};
