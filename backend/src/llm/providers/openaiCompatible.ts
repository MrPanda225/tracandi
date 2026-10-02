import { z } from 'zod';
import type { LocalLlmConfig } from '../../config/env.js';
import type { LlmCompletion, LlmProvider, LlmRequest, ProviderName } from '../types.js';

/** Groq's OpenAI-compatible endpoint, host of the free models of RG-13 (v1.7). */
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// External data: the answer of the service is parsed before use (clean-code.md).
const CompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullish() }).nullish() })).nullish(),
  usage: z.object({ prompt_tokens: z.number().nullish(), completion_tokens: z.number().nullish() }).nullish(),
});

const ErrorAnswerSchema = z.object({ error: z.object({ message: z.string() }).nullish() }).nullish();
const ERROR_EXCERPT_LENGTH = 300;
const RETRY_AFTER = 'retry-after';
const MS_PER_SECOND = 1000;

/**
 * The delay the service asks for before another call, in milliseconds; null when it asks for none. A free tier
 * bounded by tokens per minute answers it on every refusal, and it is far shorter than a blind backoff.
 */
const retryAfterMsOf = (response: Response): number | null => {
  const seconds = Number(response.headers.get(RETRY_AFTER) ?? '');
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * MS_PER_SECOND) : null;
};

/** The message of a refusal, as the service words it; its body is short and holds no prompt. */
const describeFailure = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '');
  const parsed = ErrorAnswerSchema.safeParse(
    ((): unknown => {
      try {
        return JSON.parse(body) as unknown;
      } catch {
        return undefined;
      }
    })(),
  );
  const message = parsed.success ? parsed.data?.error?.message : undefined;
  return (message ?? body).slice(0, ERROR_EXCERPT_LENGTH);
};

export interface OpenAiCompatibleDeps {
  /** Route entry of RG-13 this model serves, as journaled in `llm_calls.provider`. */
  name: ProviderName;
  model: string;
  /** Root of the API, without a trailing slash (`https://api.groq.com/openai/v1`). */
  baseUrl: string;
  apiKey: string;
  /**
   * ADR-16: asks a model that reasons by default not to (`reasoning_effort: "none"`). On the local server a reasoning
   * model uses up the whole output ceiling thinking and answers nothing; the hosted services refuse this value, so
   * only the local model sets it.
   */
  reasoningEffort?: 'none';
  /** ENF-SEC-25: a failure to reach the server tells neither its address nor the token (the local model). */
  redactNetworkErrors?: boolean;
  /** Injected so that tests never reach the network (testing.md). */
  fetchImpl?: typeof fetch;
}

/**
 * Adapter for any service speaking the OpenAI chat completions format (Groq, and the others behind the same
 * format): system instruction apart, JSON answer asked for, the text of the first choice returned.
 * @throws an Error carrying the HTTP `status` of the refusal, so that the router asks an overloaded model again
 * (ENF-FIA-10); also on an abort, an answer outside the format, or an answer without text.
 * @req EF-IA-01, EF-IA-02, EF-IA-06, RG-13
 */
export const createOpenAiCompatibleProvider = ({
  name,
  model,
  baseUrl,
  apiKey,
  reasoningEffort,
  redactNetworkErrors = false,
  fetchImpl = fetch,
}: OpenAiCompatibleDeps): LlmProvider => {
  const send = ({ system, prompt, maxOutputTokens, signal }: LlmRequest): Promise<Response> =>
    fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens,
        // The router validates the answer against the schema of the task; JSON mode spares it a prose answer.
        response_format: { type: 'json_object' },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      signal,
    }).catch((error: unknown) => {
      // An abort is the router's own timeout and tells nothing; any other network error names the host it tried.
      if (!redactNetworkErrors || signal.aborted) throw error;
      throw new Error(`${model}: the model server could not be reached`);
    });

  return {
    name,
    model,
    async complete(request: LlmRequest): Promise<LlmCompletion> {
      const response = await send(request);
      if (!response.ok) {
        throw Object.assign(new Error(`${model}: ${await describeFailure(response)}`), {
          status: response.status,
          retryAfterMs: retryAfterMsOf(response),
        });
      }
      const answer = CompletionSchema.parse(await response.json());
      const text = answer.choices?.[0]?.message?.content;
      if (!text) throw new Error(`${model} answered with no text`);
      return {
        text,
        inputTokens: answer.usage?.prompt_tokens ?? null,
        outputTokens: answer.usage?.completion_tokens ?? null,
      };
    },
  };
};

/** Configuration of one model behind an OpenAI-compatible service. */
export interface OpenAiCompatibleConfig {
  apiKey: string;
  model: string;
}

/**
 * The Groq models configured, each one a route entry of RG-13; a model left out of the configuration is left out
 * of the routing (EF-IA-05).
 * @req EF-IA-05, RG-13
 */
export const connectGroq = (apiKey: string, models: Partial<Record<ProviderName, string>>): LlmProvider[] =>
  Object.entries(models).flatMap(([name, model]) =>
    model
      ? [
          createOpenAiCompatibleProvider({
            name: name as ProviderName,
            model,
            baseUrl: GROQ_BASE_URL,
            apiKey,
          }),
        ]
      : [],
  );

/**
 * The local model of the operator (EF-IA-07, ADR-16): an OpenAI-compatible service such as Ollama, behind the address
 * and the token of the configuration (ENF-SEC-24), asked not to reason, and never telling where it is (ENF-SEC-25).
 * @req EF-IA-07, ENF-SEC-24, ENF-SEC-25
 */
export const connectLocal = (config: LocalLlmConfig, fetchImpl?: typeof fetch): LlmProvider =>
  createOpenAiCompatibleProvider({
    name: 'local',
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    reasoningEffort: 'none',
    redactNetworkErrors: true,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
