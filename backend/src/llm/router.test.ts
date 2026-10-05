import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { llmProvider, llmTask } from '../db/schema.js';
import { HttpError, LlmUnavailableError } from '../lib/errors.js';
import {
  createLlmRouter,
  LLM_TIMEOUT_MS,
  type LlmCallRecord,
  PROVIDER_ATTEMPTS,
  TASK_ROUTES,
} from './router.js';
import type { LlmCompletion, LlmProvider, LlmRequest, ProviderName } from './types.js';

const SCHEMA = z.object({ category: z.enum(['interview', 'rejected']) });
const INPUT = {
  userId: 7,
  system: 'Classe le message.',
  prompt: '<email>Nous vous proposons un entretien</email>',
  schema: SCHEMA,
};

const answer = (value: unknown): LlmCompletion => ({
  text: JSON.stringify(value),
  inputTokens: 120,
  outputTokens: 30,
});

const fakeProvider = (name: ProviderName, complete: (request: LlmRequest) => Promise<LlmCompletion>) => {
  const provider = { name, model: `${name}-test-model`, complete: vi.fn(complete) };
  return provider satisfies LlmProvider;
};

interface LoggedEntry {
  message: string;
  context: Record<string, unknown>;
}

const setup = (providers: Partial<Record<ProviderName, LlmProvider>>) => {
  const journal: LlmCallRecord[] = [];
  const logged: LoggedEntry[] = [];
  const waits: number[] = [];
  const record = (message: string, context: Record<string, unknown> = {}) =>
    logged.push({ message, context });
  const router = createLlmRouter({
    providers,
    journal: (entry) => {
      journal.push(entry);
      return Promise.resolve();
    },
    logger: { info: record, warn: record, error: record },
    // Waiting between attempts is recorded, never really awaited (testing.md).
    sleep: (ms) => {
      waits.push(ms);
      return Promise.resolve();
    },
  });
  return { router, journal, logged, waits };
};

/** A failure of a provider as its SDK reports it: HTTP status and message. */
const apiFailure = (status: number, message: string) => Object.assign(new Error(message), { status });

afterEach(() => {
  vi.useRealTimers();
});

describe('TASK_ROUTES', () => {
  it('[ENF-MAI-04] routes every task of the data model to every known provider, with fallbacks', () => {
    expect(Object.keys(TASK_ROUTES).sort()).toEqual([...llmTask.enumValues].sort());
    // T-1001 (v1.35): the local model is a known provider that no route names yet; T-1003 routes it by mode.
    const routed = llmProvider.enumValues.filter((provider) => provider !== 'local');
    for (const route of Object.values(TASK_ROUTES)) {
      expect(new Set(route)).toEqual(new Set(routed));
    }
  });

  it('[EF-IA-07] [RG-13] gives no task to the local model before the routes by mode of T-1003', () => {
    for (const route of Object.values(TASK_ROUTES)) {
      expect(route).not.toContain('local');
    }
  });

  it('[RG-13] puts the three Groq slots first, Gemini and Claude as fallbacks', () => {
    // v1.8: the Groq slots lead every task; Gemini serves the volume tasks first, Claude the writing ones.
    for (const route of Object.values(TASK_ROUTES)) {
      expect(route.slice(0, 3)).toEqual(['groq_1', 'groq_2', 'groq_3']);
    }
    expect(TASK_ROUTES.classify_emails.slice(-2)).toEqual(['gemini', 'claude']);
    expect(TASK_ROUTES.score_offers.slice(-2)).toEqual(['gemini', 'claude']);
    expect(TASK_ROUTES.extract_offers.slice(-2)).toEqual(['gemini', 'claude']);
    expect(TASK_ROUTES.tailor_cv.slice(-2)).toEqual(['claude', 'gemini']);
    expect(TASK_ROUTES.write_motivation.slice(-2)).toEqual(['claude', 'gemini']);
  });
});

describe('runTask — a provider that refuses for the moment', () => {
  it('[ENF-FIA-10] asks an overloaded model again before handing over to the fallback', async () => {
    let calls = 0;
    const gemini = fakeProvider('gemini', () => {
      calls += 1;
      return calls < 3
        ? Promise.reject(apiFailure(503, 'This model is currently experiencing high demand.'))
        : Promise.resolve(answer({ category: 'interview' }));
    });
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' })));
    const { router, journal, waits } = setup({ gemini, claude });

    const result = await router.runTask('classify_emails', INPUT);

    expect(result).toEqual({ data: { category: 'interview' }, provider: 'gemini' });
    expect(calls).toBe(3);
    expect(claude.complete).not.toHaveBeenCalled();
    expect(waits).toEqual([2000, 5000]);
    // EF-IA-06: one journal row per call, the two refusals included.
    expect(journal.map((entry) => entry.outcome)).toEqual(['error', 'error', 'success']);
  });

  it('[ENF-FIA-10] [EF-IA-02] hands over to the fallback once the attempts of the first provider are spent', async () => {
    const gemini = fakeProvider('gemini', () => Promise.reject(apiFailure(503, 'high demand')));
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' })));
    const { router, journal } = setup({ gemini, claude });

    const result = await router.runTask('classify_emails', INPUT);

    expect(result.provider).toBe('claude');
    expect(gemini.complete).toHaveBeenCalledTimes(PROVIDER_ATTEMPTS);
    expect(journal).toHaveLength(PROVIDER_ATTEMPTS + 1);
  });

  it('[RG-13] hands a saturated provider over to the next one at once, without waiting', async () => {
    const saturated = Object.assign(new Error('Rate limit reached: tokens per minute'), {
      status: 429,
      retryAfterMs: 21_000,
    });
    const first = fakeProvider('groq_1', () => Promise.reject(saturated));
    const second = fakeProvider('groq_2', () => Promise.resolve(answer({ category: 'interview' })));
    const { router, waits } = setup({ groq_1: first, groq_2: second });

    const result = await router.runTask('classify_emails', INPUT);

    expect(result.provider).toBe('groq_2');
    expect(first.complete).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('[ENF-FIA-10] waits the delay a saturated provider asks for when it is the last one', async () => {
    let calls = 0;
    const saturated = Object.assign(new Error('Rate limit reached: tokens per minute'), {
      status: 429,
      retryAfterMs: 1_740,
    });
    const only = fakeProvider('groq_1', () => {
      calls += 1;
      return calls === 1 ? Promise.reject(saturated) : Promise.resolve(answer({ category: 'interview' }));
    });
    const { router, waits } = setup({ groq_1: only });

    await router.runTask('classify_emails', INPUT);

    // The service said « try again in 1.74 s »: that beats a blind backoff.
    expect(waits).toEqual([1_740]);
  });

  it('[ENF-FIA-10] never asks again when the provider refused the request itself', async () => {
    const credit = apiFailure(400, 'Your credit balance is too low to access the Anthropic API.');
    const claude = fakeProvider('claude', () => Promise.reject(credit));
    const gemini = fakeProvider('gemini', () => Promise.reject(apiFailure(404, 'model not found')));
    const { router, waits } = setup({ claude, gemini });

    await expect(router.runTask('tailor_cv', INPUT)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(claude.complete).toHaveBeenCalledTimes(1);
    expect(gemini.complete).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });

  it('[EF-IA-02] never asks again a provider that stayed silent for 60 s', async () => {
    vi.useFakeTimers();
    const gemini = fakeProvider('gemini', () => new Promise<LlmCompletion>(() => undefined));
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' })));
    const { router, waits } = setup({ gemini, claude });

    const running = router.runTask('classify_emails', INPUT);
    await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS);

    expect((await running).provider).toBe('claude');
    expect(gemini.complete).toHaveBeenCalledTimes(1);
    expect(waits).toEqual([]);
  });
});

describe('runTask — why a provider was set aside', () => {
  it('[EF-IA-02] logs the failure of a provider before falling back, without the prompt nor the answer', async () => {
    const outage = Object.assign(new Error('401 invalid x-api-key'), { status: 401 });
    const { router, logged } = setup({
      gemini: fakeProvider('gemini', () => Promise.reject(outage)),
      claude: fakeProvider('claude', () => Promise.resolve(answer({ category: 'interview' }))),
    });

    await router.runTask('classify_emails', INPUT);

    expect(logged).toEqual([
      {
        message: 'llm provider set aside',
        context: {
          task: 'classify_emails',
          provider: 'gemini',
          model: 'gemini-test-model',
          outcome: 'error',
          error: outage,
        },
      },
    ]);
  });

  it('[EF-IA-03] logs the fields the schema rejected, as paths, never their value', async () => {
    const { router, logged } = setup({
      gemini: fakeProvider('gemini', () => Promise.resolve(answer({ category: 'embauché' }))),
      claude: fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' }))),
    });

    await router.runTask('classify_emails', INPUT);

    expect(logged[0]?.context).toMatchObject({
      outcome: 'invalid_output',
      issues: [{ path: 'category', code: 'invalid_enum_value' }],
    });
    expect(JSON.stringify(logged)).not.toContain('embauché');
  });
});

describe('runTask', () => {
  it('[EF-IA-01] gives the task to the priority provider of RG-13 only', async () => {
    const first = fakeProvider('groq_1', () => Promise.resolve(answer({ category: 'interview' })));
    const second = fakeProvider('groq_2', () => Promise.resolve(answer({ category: 'rejected' })));
    const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
    const { router } = setup({ groq_1: first, groq_2: second, gemini });

    const classified = await router.runTask('classify_emails', INPUT);
    const tailored = await router.runTask('tailor_cv', INPUT);

    expect(classified).toEqual({ data: { category: 'interview' }, provider: 'groq_1' });
    expect(tailored).toEqual({ data: { category: 'interview' }, provider: 'groq_1' });
    expect(first.complete).toHaveBeenCalledTimes(2);
    expect(second.complete).not.toHaveBeenCalled();
    expect(gemini.complete).not.toHaveBeenCalled();
  });

  it('[EF-IA-01] sends the system instruction and the prompt unchanged, with an output bound', async () => {
    const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
    const { router } = setup({ gemini });

    await router.runTask('classify_emails', { ...INPUT, maxOutputTokens: 512 });

    expect(gemini.complete).toHaveBeenCalledWith(
      expect.objectContaining({ system: INPUT.system, prompt: INPUT.prompt, maxOutputTokens: 512 }),
    );
  });

  it('[EF-IA-02] gives the task to the next provider when the first one fails', async () => {
    const gemini = fakeProvider('gemini', () => Promise.reject(new Error('503 Service Unavailable')));
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'interview' })));
    const { router } = setup({ gemini, claude });

    await expect(router.runTask('classify_emails', INPUT)).resolves.toEqual({
      data: { category: 'interview' },
      provider: 'claude',
    });
  });

  it('[EF-IA-02] gives the task to the next provider after 60 seconds without answer', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const gemini = fakeProvider('gemini', (request) => {
      signal = request.signal;
      return new Promise<LlmCompletion>(() => undefined);
    });
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'interview' })));
    const { router, journal } = setup({ gemini, claude });

    const result = router.runTask('classify_emails', INPUT);
    await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS - 1);
    expect(claude.complete).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toMatchObject({ provider: 'claude' });
    expect(signal?.aborted).toBe(true);
    expect(journal[0]).toMatchObject({ provider: 'gemini', outcome: 'timeout', durationMs: LLM_TIMEOUT_MS });
    expect(LLM_TIMEOUT_MS).toBe(60_000);
  });

  it.each([
    ['an answer outside the schema', { category: 'offer' }],
    ['an answer that is not JSON', 'Voici la catégorie : entretien'],
  ])('[EF-IA-02] [EF-IA-03] gives the task to the next provider after %s', async (_case, output) => {
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    const gemini = fakeProvider('gemini', () =>
      Promise.resolve({ text, inputTokens: 100, outputTokens: 10 }),
    );
    const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' })));
    const { router, journal } = setup({ gemini, claude });

    await expect(router.runTask('classify_emails', INPUT)).resolves.toEqual({
      data: { category: 'rejected' },
      provider: 'claude',
    });
    expect(journal.map((call) => call.outcome)).toEqual(['invalid_output', 'success']);
  });

  it('[EF-IA-03] reads a JSON answer wrapped in a Markdown code block', async () => {
    const gemini = fakeProvider('gemini', () =>
      Promise.resolve({ text: '```json\n{ "category": "interview" }\n```', inputTokens: 1, outputTokens: 1 }),
    );
    const { router } = setup({ gemini });

    await expect(router.runTask('classify_emails', INPUT)).resolves.toMatchObject({
      data: { category: 'interview' },
    });
  });

  it('[EF-IA-04] [EF-IA-03] fails with a 502 and never returns an answer outside the schema', async () => {
    const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'offer' })));
    const claude = fakeProvider('claude', () => Promise.reject(new Error('529 Overloaded')));
    const { router } = setup({ gemini, claude });

    const failure = router.runTask('classify_emails', INPUT);

    await expect(failure).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(failure).rejects.toMatchObject({ statusCode: 502, answerRejected: true });
  });

  it('[EF-IA-04] tells apart providers all out of reach from answers all refused', async () => {
    const gemini = fakeProvider('gemini', () => Promise.reject(apiFailure(503, 'high demand')));
    const claude = fakeProvider('claude', () =>
      Promise.reject(apiFailure(400, 'Your credit balance is too low')),
    );
    const { router } = setup({ gemini, claude });

    await expect(router.runTask('tailor_cv', INPUT)).rejects.toMatchObject({
      statusCode: 502,
      answerRejected: false,
    });
  });

  it('[EF-IA-05] works with a single configured provider, whatever its rank in the route', async () => {
    const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
    const { router } = setup({ gemini });

    await expect(router.runTask('tailor_cv', INPUT)).resolves.toMatchObject({ provider: 'gemini' });
  });

  it('[EF-IA-05] refuses to start without any provider', () => {
    expect(() => setup({})).toThrow('At least one LLM provider must be configured');
  });

  it('[EF-IA-06] records every call: provider, model, task, duration, tokens and outcome, never the content', async () => {
    vi.useFakeTimers();
    const gemini = fakeProvider('gemini', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      throw new Error('quota exceeded');
    });
    const claude = fakeProvider('claude', async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return answer({ category: 'interview' });
    });
    const { router, journal } = setup({ gemini, claude });

    const result = router.runTask('classify_emails', INPUT);
    await vi.advanceTimersByTimeAsync(2300);
    await result;

    expect(journal).toEqual([
      {
        userId: 7,
        task: 'classify_emails',
        provider: 'gemini',
        model: 'gemini-test-model',
        outcome: 'error',
        durationMs: 1500,
        inputTokens: null,
        outputTokens: null,
      },
      {
        userId: 7,
        task: 'classify_emails',
        provider: 'claude',
        model: 'claude-test-model',
        outcome: 'success',
        durationMs: 800,
        inputTokens: 120,
        outputTokens: 30,
      },
    ]);
  });
});

describe('LlmUnavailableError', () => {
  it('[EF-IA-04] is an HTTP 502 with an explicit French message', () => {
    const error = new LlmUnavailableError();

    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(502);
    expect(error.message).toBe(
      'Aucun service d’IA n’a pu traiter la demande. Réessayez dans quelques minutes.',
    );
  });
});
