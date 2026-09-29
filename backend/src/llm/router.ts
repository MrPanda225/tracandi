import type { z } from 'zod';
import { LlmUnavailableError } from '../lib/errors.js';
import { isTransientFailure, propertyOf, statusOfError } from '../lib/httpStatus.js';
import type { Logger } from '../lib/logger.js';
import { type Sleep, wait } from '../lib/rateLimiter.js';
import type { LlmCompletion, LlmOutcome, LlmProvider, LlmTaskName, ProviderName } from './types.js';

// RG-13 (v1.8): the three Groq slots in order, then the historical fallbacks — Gemini first for the volume tasks,
// Claude first for the writing ones.
const VOLUME_ROUTE = ['groq_1', 'groq_2', 'groq_3', 'gemini', 'claude'] as const;
const WRITING_ROUTE = ['groq_1', 'groq_2', 'groq_3', 'claude', 'gemini'] as const;

/**
 * Providers of each task, in order of preference. Adding a task = one entry here, one prompt, one schema
 * (skill `add-llm-task`); adding a task never changes an adapter (ENF-MAI-04).
 */
export const TASK_ROUTES: Readonly<Record<LlmTaskName, readonly ProviderName[]>> = {
  classify_emails: VOLUME_ROUTE,
  score_offers: VOLUME_ROUTE,
  extract_offers: VOLUME_ROUTE,
  tailor_cv: WRITING_ROUTE,
  write_motivation: WRITING_ROUTE,
  // EF-CAN-17 (RG-13 v1.22): a short text in French for the candidate to send.
  write_follow_up: WRITING_ROUTE,
  // EF-CVX-24 (RG-13): an analysis with bounded scores, like the scoring of the offers.
  diagnose_cv: VOLUME_ROUTE,
};

/** EF-IA-02: a provider silent for longer than this is abandoned for the next one. */
export const LLM_TIMEOUT_MS = 60_000;
/**
 * Attempts on one provider, the first one included, before its fallback takes over. Only a refusal that passes on
 * its own is worth another try: an overloaded model (503) or too many requests (429), never a refused request.
 * @req ENF-FIA-10
 */
const RETRY_BACKOFF_MS = [2000, 5000] as const;
export const PROVIDER_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;
// Room for a whole CV or a batch of classifications; billing follows the tokens actually produced.
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

/** One provider call as journaled in `llm_calls` (EF-IA-06): never the prompt nor the answer. */
export interface LlmCallRecord {
  userId: number;
  task: LlmTaskName;
  provider: ProviderName;
  model: string;
  outcome: LlmOutcome;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type LlmJournal = (record: LlmCallRecord) => Promise<void>;

export interface RunTaskInput<T> {
  /** Owner of the call, for the journal and the monthly cost (EF-CFG-03). */
  userId: number;
  system: string;
  prompt: string;
  /**
   * EF-IA-03: the only barrier against an aberrant answer; nothing outside it is ever returned. Its input is the
   * parsed JSON of the provider, hence `unknown`: a schema may map a wording before checking it (EF-GML-19).
   */
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxOutputTokens?: number;
}

export interface TaskResult<T> {
  data: T;
  provider: ProviderName;
}

export interface LlmRouter {
  /**
   * Runs an AI task on the providers of its route, in order, until one answers JSON valid against the schema.
   * @throws LlmUnavailableError (502) when every configured provider failed, timed out or answered outside the schema;
   * its `answerRejected` says whether one of them did answer, outside the schema.
   * @req EF-IA-01, EF-IA-02, EF-IA-03, EF-IA-04, EF-IA-06
   */
  runTask: <T>(task: LlmTaskName, input: RunTaskInput<T>) => Promise<TaskResult<T>>;
}

interface LlmRouterDeps {
  /** Configured providers only (EF-IA-05: one key is enough). */
  providers: Partial<Record<ProviderName, LlmProvider>>;
  journal: LlmJournal;
  /** Receives the reason of every provider left aside; `llm_calls` only keeps the outcome. */
  logger: Logger;
  timeoutMs?: number;
  sleep?: Sleep;
}

/** Why an attempt did not give usable data, for the logs only: never the prompt nor the answer (ENF-SEC-08). */
type Refusal =
  | { error: unknown }
  /** Fields of the answer the schema rejected, as paths and codes, without any value (ENF-RGP-01). */
  | { issues: { path: string; code: string }[] };

type Attempt<T> =
  | { outcome: 'success'; data: T; completion: LlmCompletion }
  | {
      outcome: Exclude<LlmOutcome, 'success'>;
      completion: LlmCompletion | null;
      refusal: Refusal;
    };

const CODE_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/;

/** Parsed JSON of an answer, tolerating a Markdown code block around it; undefined when it is not JSON. */
const parseJson = (text: string): unknown => {
  const trimmed = text.trim();
  const body = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
};

/** Rejects once the signal is aborted, so that a provider ignoring the signal cannot hold the task. */
const abandonedOn = (signal: AbortSignal): Promise<never> =>
  new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('LLM call abandoned')), { once: true });
  });

/**
 * One call to one provider, bounded to `timeoutMs` and validated against the schema of the task.
 * Never throws: a failure, a timeout and an answer outside the schema all come back as an outcome with its reason.
 * @req EF-IA-02, EF-IA-03
 */
const attempt = async <T>(
  provider: LlmProvider,
  input: RunTaskInput<T>,
  timeoutMs: number,
): Promise<Attempt<T>> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await Promise.race([
      provider.complete({
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        signal: controller.signal,
      }),
      abandonedOn(controller.signal),
    ]);
    const parsed = input.schema.safeParse(parseJson(completion.text));
    if (parsed.success) return { outcome: 'success', data: parsed.data, completion };
    return {
      outcome: 'invalid_output',
      completion,
      refusal: {
        issues: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code })),
      },
    };
  } catch (error) {
    return { outcome: controller.signal.aborted ? 'timeout' : 'error', completion: null, refusal: { error } };
  } finally {
    clearTimeout(timer);
  }
};

const TOO_MANY_REQUESTS = 429;

/** ENF-FIA-10: the provider refused for a reason that passes on its own, so the same call may work in a moment. */
const isWorthAnotherTry = (refusal: Refusal): boolean =>
  'error' in refusal && isTransientFailure(refusal.error);

/**
 * RG-13: the provider refused because its own budget is spent for the moment (tokens or requests per minute). The
 * next provider of the route has its own budget, so it takes the task straight away instead of waiting.
 */
const isSaturated = (refusal: Refusal): boolean =>
  'error' in refusal && statusOfError(refusal.error) === TOO_MANY_REQUESTS;

/** The delay the provider asked for, when it gave one (ENF-FIA-10). */
const askedDelayOf = (refusal: Refusal): number | null => {
  if (!('error' in refusal)) return null;
  const asked = propertyOf(refusal.error, 'retryAfterMs');
  return typeof asked === 'number' && asked >= 0 ? asked : null;
};

/** What one provider run needs: the journal of the calls, the logs of the refusals and the time budget. */
interface ProviderRunnerDeps {
  journal: LlmJournal;
  logger: Logger;
  timeoutMs: number;
  sleep: Sleep;
}

/**
 * Runs one provider until it gives usable data, trying again while it refuses for a reason that passes on its own
 * (ENF-FIA-10). Every attempt is journaled as one `llm_calls` row (EF-IA-06) and its reason reaches the logs.
 * @req EF-IA-02, EF-IA-06, ENF-FIA-10
 */
const createProviderRunner = ({ journal, logger, timeoutMs, sleep }: ProviderRunnerDeps) => {
  const tryOnce = async <T>(
    provider: LlmProvider,
    task: LlmTaskName,
    input: RunTaskInput<T>,
  ): Promise<Attempt<T>> => {
    const startedAt = Date.now();
    const result = await attempt(provider, input, timeoutMs);
    await journal({
      userId: input.userId,
      task,
      provider: provider.name,
      model: provider.model,
      outcome: result.outcome,
      durationMs: Date.now() - startedAt,
      inputTokens: result.completion?.inputTokens ?? null,
      outputTokens: result.completion?.outputTokens ?? null,
    });
    if (result.outcome !== 'success') {
      // EF-IA-02: the next attempt or the next provider takes over, but the reason must not be lost.
      logger.warn('llm provider set aside', {
        task,
        provider: provider.name,
        model: provider.model,
        outcome: result.outcome,
        ...result.refusal,
      });
    }
    return result;
  };

  return async <T>({
    provider,
    task,
    input,
    hasFallback,
  }: {
    provider: LlmProvider;
    task: LlmTaskName;
    input: RunTaskInput<T>;
    /** Another provider of the route can take over, so a saturated one is not waited for (RG-13). */
    hasFallback: boolean;
  }): Promise<Attempt<T>> => {
    let last = await tryOnce(provider, task, input);
    for (const backoffMs of RETRY_BACKOFF_MS) {
      if (last.outcome === 'success' || !isWorthAnotherTry(last.refusal)) return last;
      // A saturated provider is left to the next one of the route rather than waited for (RG-13).
      if (isSaturated(last.refusal) && hasFallback) return last;
      await sleep(askedDelayOf(last.refusal) ?? backoffMs);
      last = await tryOnce(provider, task, input);
    }
    return last;
  };
};

/**
 * Creates the AI router. Every call is bounded to `timeoutMs` (60 s), validated against the task schema and journaled.
 * @throws Error when no provider is configured (the configuration refuses to start in that case, EF-IA-05).
 * @req EF-IA-01, EF-IA-02, EF-IA-03, EF-IA-04, EF-IA-05, EF-IA-06, RG-13, ENF-FIA-10
 */
export const createLlmRouter = ({
  providers,
  journal,
  logger,
  timeoutMs = LLM_TIMEOUT_MS,
  sleep = wait,
}: LlmRouterDeps): LlmRouter => {
  if (Object.values(providers).every((provider) => provider === undefined)) {
    throw new Error('At least one LLM provider must be configured');
  }
  const runProvider = createProviderRunner({ journal, logger, timeoutMs, sleep });

  return {
    async runTask(task, input) {
      const route = TASK_ROUTES[task].filter((name) => providers[name] !== undefined);
      let answerRejected = false;
      for (const [index, name] of route.entries()) {
        const provider = providers[name];
        if (!provider) continue;
        const result = await runProvider({
          provider,
          task,
          input,
          hasFallback: index < route.length - 1,
        });
        if (result.outcome === 'success') return { data: result.data, provider: name };
        answerRejected ||= result.outcome === 'invalid_output';
      }
      throw new LlmUnavailableError(answerRejected);
    },
  };
};
