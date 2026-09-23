import { z } from 'zod';
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
  fetchImpl = fetch,
}: OpenAiCompatibleDeps): LlmProvider => ({
  name,
  model,
  async complete({ system, prompt, maxOutputTokens, signal }: LlmRequest): Promise<LlmCompletion> {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens,
        // The router validates the answer against the schema of the task; JSON mode spares it a prose answer.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      signal,
    });
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
});

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
