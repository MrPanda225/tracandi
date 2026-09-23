import { type GenerateContentParameters, type GenerateContentResponse, GoogleGenAI } from '@google/genai';
import type { LlmCompletion, LlmProvider, LlmRequest } from '../types.js';

/** The part of the Google GenAI client used here, injected so that tests never call the real API. */
export interface GeminiModelsClient {
  models: {
    generateContent: (params: GenerateContentParameters) => Promise<GenerateContentResponse>;
  };
}

/**
 * Gemini adapter: JSON answer requested (`application/json`), system instruction apart.
 * @throws on an API error, an abort, or an answer without text (blocked by safety filters, empty), so that the
 * router falls back.
 * @req EF-IA-01, EF-IA-06
 */
export const createGeminiProvider = ({
  client,
  model,
}: {
  client: GeminiModelsClient;
  model: string;
}): LlmProvider => ({
  name: 'gemini',
  model,
  async complete({ system, prompt, maxOutputTokens, signal }: LlmRequest): Promise<LlmCompletion> {
    const response = await client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        maxOutputTokens,
        abortSignal: signal,
      },
    });
    const text = response.text;
    if (!text) throw new Error('Gemini answered with no text');
    return {
      text,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    };
  },
});

/** Gemini adapter on the real API, with the key and model of the configuration (never hard-coded). */
export const connectGemini = ({ apiKey, model }: { apiKey: string; model: string }): LlmProvider =>
  createGeminiProvider({ client: new GoogleGenAI({ apiKey }), model });
