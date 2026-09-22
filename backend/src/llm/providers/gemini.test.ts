import { GenerateContentResponse } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { createGeminiProvider, type GeminiModelsClient } from './gemini.js';

const response = (text: string | undefined, usage = { promptTokenCount: 530, candidatesTokenCount: 22 }) => {
  const result = new GenerateContentResponse();
  result.candidates = text === undefined ? [] : [{ content: { role: 'model', parts: [{ text }] } }];
  result.usageMetadata = usage;
  return result;
};

const fakeClient = (answer: GenerateContentResponse) => {
  const generateContent = vi.fn(() => Promise.resolve(answer));
  const client: GeminiModelsClient = { models: { generateContent } };
  return { client, generateContent };
};

describe('createGeminiProvider', () => {
  it('[EF-IA-01] sends the prompt with the system instruction, a JSON answer, the configured model, the bound and the signal', async () => {
    const { client, generateContent } = fakeClient(response('{"category":"interview"}'));
    const provider = createGeminiProvider({ client, model: 'gemini-2.5-flash' });
    const signal = new AbortController().signal;

    await provider.complete({ system: 'Consigne', prompt: 'Contenu', maxOutputTokens: 1024, signal });

    expect(provider).toMatchObject({ name: 'gemini', model: 'gemini-2.5-flash' });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Contenu',
      config: {
        systemInstruction: 'Consigne',
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        abortSignal: signal,
      },
    });
  });

  it('[EF-IA-06] returns the text of the answer and its token usage', async () => {
    const { client } = fakeClient(response('{"category":"interview"}'));
    const provider = createGeminiProvider({ client, model: 'gemini-2.5-flash' });

    await expect(
      provider.complete({
        system: 's',
        prompt: 'p',
        maxOutputTokens: 100,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ text: '{"category":"interview"}', inputTokens: 530, outputTokens: 22 });
  });

  it('[EF-IA-02] treats an answer without text (blocked or empty) as a failure', async () => {
    const { client } = fakeClient(response(undefined));
    const provider = createGeminiProvider({ client, model: 'gemini-2.5-flash' });

    await expect(
      provider.complete({
        system: 's',
        prompt: 'p',
        maxOutputTokens: 100,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('no text');
  });
});
