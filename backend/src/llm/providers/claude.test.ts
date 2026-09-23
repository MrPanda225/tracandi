import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { type ClaudeMessagesClient, createClaudeProvider } from './claude.js';

const message = (overrides: Partial<Anthropic.Message>): Anthropic.Message =>
  ({
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-test',
    content: [{ type: 'text', text: '{"category":"interview"}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 812, output_tokens: 41 },
    ...overrides,
  }) as Anthropic.Message;

const fakeClient = (response: Anthropic.Message) => {
  const create = vi.fn(() => Promise.resolve(response));
  const client: ClaudeMessagesClient = { messages: { create } };
  return { client, create };
};

describe('createClaudeProvider', () => {
  it('[EF-IA-01] sends the system instruction, one user message, the configured model, the bound and the signal', async () => {
    const { client, create } = fakeClient(message({}));
    const provider = createClaudeProvider({ client, model: 'claude-sonnet-5' });
    const signal = new AbortController().signal;

    await provider.complete({ system: 'Consigne', prompt: 'Contenu', maxOutputTokens: 2048, signal });

    expect(provider).toMatchObject({ name: 'claude', model: 'claude-sonnet-5' });
    expect(create).toHaveBeenCalledWith(
      {
        model: 'claude-sonnet-5',
        max_tokens: 2048,
        system: 'Consigne',
        messages: [{ role: 'user', content: 'Contenu' }],
      },
      { signal },
    );
  });

  it('[EF-IA-06] returns the text of the answer and its token usage', async () => {
    const { client } = fakeClient(
      message({
        content: [
          { type: 'text', text: '{"category":', citations: null },
          { type: 'text', text: '"interview"}', citations: null },
        ],
      }),
    );
    const provider = createClaudeProvider({ client, model: 'claude-sonnet-5' });

    await expect(
      provider.complete({
        system: 's',
        prompt: 'p',
        maxOutputTokens: 100,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ text: '{"category":"interview"}', inputTokens: 812, outputTokens: 41 });
  });

  it('[EF-IA-02] treats a refusal as a failure, so that the router falls back', async () => {
    const { client } = fakeClient(message({ stop_reason: 'refusal', content: [] }));
    const provider = createClaudeProvider({ client, model: 'claude-sonnet-5' });

    await expect(
      provider.complete({
        system: 's',
        prompt: 'p',
        maxOutputTokens: 100,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('refusal');
  });
});
