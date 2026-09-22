import type { z } from 'zod';
import { LlmUnavailableError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { LlmCompletion, LlmOutcome, LlmProvider, LlmTaskName, ProviderName } from './types.js';

/**
 * RG-13: providers of each task, in order of preference. Adding a task = one entry here, one prompt, one schema
 * (skill `add-llm-task`); the providers never change (ENF-MAI-04).
 */
export const TASK_ROUTES: Readonly<Record<LlmTaskName, readonly ProviderName[]>> = {
  classify_emails: ['gemini', 'claude'],
  score_offers: ['gemini', 'claude'],
  extract_offers: ['gemini', 'claude'],
  tailor_cv: ['claude', 'gemini'],
  write_motivation: ['claude', 'gemini'],
};

/** EF-IA-02: a provider silent for longer than this is abandoned for the next one. */
export const LLM_TIMEOUT_MS = 60_000;
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
  /** EF-IA-03: the only barrier against an aberrant answer; nothing outside it is ever returned. */
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
}

export interface TaskResult<T> {
  data: T;
  provider: ProviderName;
}

export interface LlmRouter {
  /**
   * Runs an AI task on the providers of its route, in order, until one answers JSON valid against the schema.
   * @throws LlmUnavailableError (502) when every configured provider failed, timed out or answered outside the schema.
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

/**
 * Creates the AI router. Every call is bounded to `timeoutMs` (60 s), validated against the task schema and journaled.
 * @throws Error when no provider is configured (the configuration refuses to start in that case, EF-IA-05).
 * @req EF-IA-01, EF-IA-02, EF-IA-03, EF-IA-04, EF-IA-05, EF-IA-06, RG-13
 */
export const createLlmRouter = ({
  providers,
  journal,
  logger,
  timeoutMs = LLM_TIMEOUT_MS,
}: LlmRouterDeps): LlmRouter => {
  if (Object.values(providers).every((provider) => provider === undefined)) {
    throw new Error('At least one LLM provider must be configured');
  }

  return {
    async runTask(task, input) {
      for (const name of TASK_ROUTES[task]) {
        const provider = providers[name];
        if (!provider) continue;
        const startedAt = Date.now();
        const result = await attempt(provider, input, timeoutMs);
        await journal({
          userId: input.userId,
          task,
          provider: name,
          model: provider.model,
          outcome: result.outcome,
          durationMs: Date.now() - startedAt,
          inputTokens: result.completion?.inputTokens ?? null,
          outputTokens: result.completion?.outputTokens ?? null,
        });
        if (result.outcome === 'success') return { data: result.data, provider: name };
        // EF-IA-02: the next provider takes over, but the reason must not be lost (clean-code.md).
        logger.warn('llm provider set aside', {
          task,
          provider: name,
          model: provider.model,
          outcome: result.outcome,
          ...result.refusal,
        });
      }
      throw new LlmUnavailableError();
    },
  };
};
