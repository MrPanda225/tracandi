import type { llmOutcome, llmProvider, llmTask } from '../db/schema.js';

/** AI tasks of RG-13, as stored in `llm_calls.task`. */
export type LlmTaskName = (typeof llmTask.enumValues)[number];
export type ProviderName = (typeof llmProvider.enumValues)[number];
export type LlmOutcome = (typeof llmOutcome.enumValues)[number];

/** One call to a language model: system instruction, prompt, output bound and cancellation. */
export interface LlmRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  /** Aborted by the router after 60 s (EF-IA-02). */
  signal: AbortSignal;
}

/** Raw answer of a provider, parsed and validated by the router, never by the provider. */
export interface LlmCompletion {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * A language model behind the router. Adapters live in `llm/providers/` and are the only code that imports an AI
 * SDK; adding a task never changes them (ENF-MAI-04).
 */
export interface LlmProvider {
  name: ProviderName;
  model: string;
  /** @throws on any failure (network, quota, refusal, empty answer): the router then tries the next provider. */
  complete: (request: LlmRequest) => Promise<LlmCompletion>;
}
