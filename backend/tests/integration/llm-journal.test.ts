import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { llmCalls, users } from '../../src/db/schema.js';
import { createLlmJournal } from '../../src/llm/repository.js';
import { createLogger } from '../../src/lib/logger.js';
import { createLlmRouter } from '../../src/llm/router.js';
import type { LlmProvider } from '../../src/llm/types.js';
import { openTestDatabase, truncateAll } from './context.js';

const database = openTestDatabase();
let userId: number;

const failing: LlmProvider = {
  name: 'gemini',
  model: 'gemini-test',
  complete: () => Promise.reject(new Error('quota')),
};
const answering: LlmProvider = {
  name: 'claude',
  model: 'claude-test',
  complete: () => Promise.resolve({ text: '{"score":72}', inputTokens: 900, outputTokens: 12 }),
};

beforeEach(async () => {
  await truncateAll(database);
  const [user] = await database.db
    .insert(users)
    .values({ email: 'journal@example.com', passwordHash: 'not-a-real-hash' })
    .returning({ id: users.id });
  if (!user) throw new Error('user not created');
  userId = user.id;
});

afterAll(async () => {
  await database.close();
});

describe('LLM calls journal', () => {
  it('[EF-IA-06] stores one llm_calls row per provider call, without any content', async () => {
    const router = createLlmRouter({
      providers: { gemini: failing, claude: answering },
      journal: createLlmJournal(database.db),
      logger: createLogger({ write: () => undefined }),
    });

    await router.runTask('score_offers', {
      userId,
      system: 'Note l’offre.',
      prompt: '<offer>Data analyst en alternance</offer>',
      schema: z.object({ score: z.number().int().min(0).max(100) }),
    });

    const rows = await database.db
      .select({
        task: llmCalls.task,
        provider: llmCalls.provider,
        model: llmCalls.model,
        outcome: llmCalls.outcome,
        durationMs: llmCalls.durationMs,
        inputTokens: llmCalls.inputTokens,
        outputTokens: llmCalls.outputTokens,
      })
      .from(llmCalls)
      .where(eq(llmCalls.userId, userId))
      .orderBy(llmCalls.id);

    expect(rows).toEqual([
      expect.objectContaining({
        task: 'score_offers',
        provider: 'gemini',
        model: 'gemini-test',
        outcome: 'error',
        inputTokens: null,
      }),
      expect.objectContaining({
        task: 'score_offers',
        provider: 'claude',
        model: 'claude-test',
        outcome: 'success',
        inputTokens: 900,
        outputTokens: 12,
      }),
    ]);
    expect(rows.every((row) => row.durationMs >= 0)).toBe(true);
  });
});
