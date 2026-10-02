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
  /** Aborted by the router after the delay of the provider (EF-IA-02, EF-IA-10). */
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
  /**
   * EF-IA-10: delay after which the router abandons a call to this provider; the router's own (60 s) when absent. The
   * local model is slower and has its own, 600 s by default.
   */
  timeoutMs?: number;
  /**
   * EF-IA-11: ceiling of output tokens asked of this provider, whatever a task asks for; none when absent. The local
   * server has a context of a few thousand tokens, so its answers are bounded (2 000 by default).
   */
  maxOutputTokens?: number;
  /** @throws on any failure (network, quota, refusal, empty answer): the router then tries the next provider. */
  complete: (request: LlmRequest) => Promise<LlmCompletion>;
}
