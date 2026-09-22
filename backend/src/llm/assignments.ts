import { TASK_ROUTES } from './router.js';
import type { LlmTaskName, ProviderName } from './types.js';

/** EF-CFG-02: what the settings screen shows of the AI configuration; never a key. */
export interface AiAssignments {
  providers: { name: ProviderName; model: string }[];
  /** Providers of each task, in the order the router tries them (RG-13), the unconfigured ones left out. */
  tasks: { task: LlmTaskName; providers: ProviderName[] }[];
}

// Display order of the providers.
const PROVIDER_ORDER: readonly ProviderName[] = ['groq_llama', 'groq_kimi', 'groq_qwen', 'gemini', 'claude'];

/**
 * The configured providers (name and model) and the providers of each task, from the single routing table.
 * @req EF-CFG-02, RG-13, EF-IA-05
 */
export const describeAssignments = (
  configured: Partial<Record<ProviderName, { model: string }>>,
): AiAssignments => ({
  providers: PROVIDER_ORDER.flatMap((name) => {
    const provider = configured[name];
    return provider ? [{ name, model: provider.model }] : [];
  }),
  tasks: (Object.keys(TASK_ROUTES) as LlmTaskName[]).map((task) => ({
    task,
    providers: TASK_ROUTES[task].filter((name) => configured[name] !== undefined),
  })),
});
