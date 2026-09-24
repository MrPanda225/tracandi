import { request } from './client';

/** Route entries of RG-13 (v1.8): the three Groq slots, then Gemini and Claude as fallbacks. */
export type ProviderName = 'claude' | 'gemini' | 'groq_1' | 'groq_2' | 'groq_3';
export type AiTask =
  | 'classify_emails'
  | 'score_offers'
  | 'extract_offers'
  | 'tailor_cv'
  | 'write_motivation'
  | 'write_follow_up';

/** AI configuration of the server (schema `AiAssignments` in /api/docs, EF-CFG-02); never a key. */
export interface AiAssignments {
  providers: { name: ProviderName; model: string }[];
  /** Providers of each task, in the order they are tried (RG-13). */
  tasks: { task: AiTask; providers: ProviderName[] }[];
}

export const fetchAiAssignments = (signal?: AbortSignal) => request<AiAssignments>('/settings/ai', { signal });

/** Features a deployment may leave out (ENF-MAI-07): the offers watch and the CV workshop. */
export type OptionalFeature = 'watch' | 'cv';

/** The optional features the server runs (schema `EnabledFeatures` in /api/docs). */
export const fetchEnabledFeatures = (signal?: AbortSignal) =>
  request<{ features: OptionalFeature[] }>('/settings/features', { signal });
