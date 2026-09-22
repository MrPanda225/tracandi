import Anthropic from '@anthropic-ai/sdk';
import type { LlmCompletion, LlmProvider, LlmRequest } from '../types.js';

/** The part of the Anthropic client used here, injected so that tests never call the real API. */
export interface ClaudeMessagesClient {
  messages: {
    create: (
      body: Anthropic.MessageCreateParamsNonStreaming,
      options?: Anthropic.RequestOptions,
    ) => Promise<Anthropic.Message>;
  };
}

// The router already falls back to the other provider: SDK retries would only delay it (60 s budget, EF-IA-02).
const SDK_MAX_RETRIES = 0;

/**
 * Claude adapter: one user message, the system instruction apart, the text blocks of the answer joined.
 * @throws on an API error, an abort, or a refusal (`stop_reason: refusal`), so that the router falls back.
 * @req EF-IA-01, EF-IA-06
 */
export const createClaudeProvider = ({
  client,
  model,
}: {
  client: ClaudeMessagesClient;
  model: string;
}): LlmProvider => ({
  name: 'claude',
  model,
  async complete({ system, prompt, maxOutputTokens, signal }: LlmRequest): Promise<LlmCompletion> {
    const message = await client.messages.create(
      { model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: prompt }] },
      { signal },
    );
    if (message.stop_reason === 'refusal') throw new Error('Claude answered with a refusal');
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens };
  },
});

/** Claude adapter on the real API, with the key and model of the configuration (never hard-coded). */
export const connectClaude = ({ apiKey, model }: { apiKey: string; model: string }): LlmProvider =>
  createClaudeProvider({ client: new Anthropic({ apiKey, maxRetries: SDK_MAX_RETRIES }), model });
