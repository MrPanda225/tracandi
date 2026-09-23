import type { Database } from '../db/client.js';
import { llmCalls } from '../db/schema.js';
import type { LlmJournal } from './router.js';

/**
 * Journal of AI calls in `llm_calls`: provider, model, task, outcome, duration and tokens, never any content
 * (EF-IA-06, ENF-SEC-08). The monthly cost is computed from it (EF-CFG-03, ENF-COU-01).
 * @req EF-IA-06
 */
export const createLlmJournal =
  (db: Database): LlmJournal =>
  async (record) => {
    await db.insert(llmCalls).values(record);
  };
