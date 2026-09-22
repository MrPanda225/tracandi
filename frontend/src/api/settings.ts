import { request } from './client';

export type ProviderName = 'claude' | 'gemini';
export type AiTask = 'classify_emails' | 'score_offers' | 'extract_offers' | 'tailor_cv' | 'write_motivation';

/** AI configuration of the server (schema `AiAssignments` in /api/docs, EF-CFG-02); never a key. */
export interface AiAssignments {
  providers: { name: ProviderName; model: string }[];
  /** Providers of each task, in the order they are tried (RG-13). */
  tasks: { task: AiTask; providers: ProviderName[] }[];
}

export const fetchAiAssignments = (signal?: AbortSignal) => request<AiAssignments>('/settings/ai', { signal });
