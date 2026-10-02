import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { llmProvider, llmTask } from '../db/schema.js';
import { HttpError, LlmUnavailableError } from '../lib/errors.js';
import {
  createLlmRouter,
  LLM_TIMEOUT_MS,
  type LlmCallRecord,
  PROVIDER_ATTEMPTS,
  SCHEDULED_ROUTES,
  TASK_ROUTES,
} from './router.js';
import type { LlmCompletion, LlmProvider, LlmRequest, LlmTaskName, ProviderName } from './types.js';

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

const fakeProvider = (
  name: ProviderName,
  complete: (request: LlmRequest) => Promise<LlmCompletion>,
  limits: {
    timeoutMs?: number;
    maxOutputTokens?: number;
    batchLimits?: { batchSize: number; descriptionChars: number };
  } = {},
) => {
  const provider = { name, model: `${name}-test-model`, complete: vi.fn(complete), ...limits };
  return provider satisfies LlmProvider;
};

interface LoggedEntry {
  message: string;
  context: Record<string, unknown>;
}

const setup = (
  providers: Partial<Record<ProviderName, LlmProvider>>,
  routes?: Readonly<Record<LlmTaskName, readonly ProviderName[]>>,
) => {
  const journal: LlmCallRecord[] = [];
  const logged: LoggedEntry[] = [];
  const waits: number[] = [];
  const record = (message: string, context: Record<string, unknown> = {}) =>
    logged.push({ message, context });
  const router = createLlmRouter({
    providers,
    ...(routes ? { routes } : {}),
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

  it('[EF-IA-09] leaves the local model out of every route of an attended run', () => {
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

  describe('limits of each provider (T-1002, v1.35)', () => {
    // T-1001 routes the local model nowhere yet: the routes are injected, as T-1003 will define them.
    const LOCAL_FIRST = { ...TASK_ROUTES, score_offers: ['local', 'gemini'] as const };
    const LOCAL_DELAY_MS = 600_000;
    const slowAnswer = (delayMs: number) =>
      new Promise<LlmCompletion>((resolve) => {
        setTimeout(() => resolve(answer({ category: 'interview' })), delayMs);
      });

    it('[EF-IA-10] abandons a hosted provider that answers in 90 seconds and accepts the local one', async () => {
      vi.useFakeTimers();
      const gemini = fakeProvider('gemini', () => slowAnswer(90_000));
      const local = fakeProvider('local', () => slowAnswer(90_000), { timeoutMs: LOCAL_DELAY_MS });
      const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'rejected' })));

      const hosted = setup({ gemini, claude }, { ...TASK_ROUTES, score_offers: ['gemini', 'claude'] });
      const hostedResult = hosted.router.runTask('score_offers', INPUT);
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(hostedResult).resolves.toMatchObject({ provider: 'claude' });
      expect(hosted.journal[0]).toMatchObject({ provider: 'gemini', outcome: 'timeout' });

      const withLocal = setup({ local, gemini }, LOCAL_FIRST);
      const localResult = withLocal.router.runTask('score_offers', INPUT);
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(localResult).resolves.toMatchObject({ provider: 'local' });
      expect(withLocal.journal).toEqual([expect.objectContaining({ provider: 'local', outcome: 'success' })]);
    });

    it('[EF-IA-10] abandons the local model at 600 seconds and gives the task to the next provider', async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const local = fakeProvider(
        'local',
        (request) => {
          signal = request.signal;
          return slowAnswer(601_000);
        },
        { timeoutMs: LOCAL_DELAY_MS },
      );
      const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
      const { router, journal } = setup({ local, gemini }, LOCAL_FIRST);

      const result = router.runTask('score_offers', INPUT);
      await vi.advanceTimersByTimeAsync(LOCAL_DELAY_MS - 1);
      expect(gemini.complete).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      await expect(result).resolves.toMatchObject({ provider: 'gemini' });
      expect(signal?.aborted).toBe(true);
      expect(journal[0]).toMatchObject({ provider: 'local', outcome: 'timeout', durationMs: LOCAL_DELAY_MS });
    });

    it('[EF-IA-10] keeps the delay of the router for a provider that has none of its own', async () => {
      vi.useFakeTimers();
      const gemini = fakeProvider('gemini', () => slowAnswer(LLM_TIMEOUT_MS + 1));
      const claude = fakeProvider('claude', () => Promise.resolve(answer({ category: 'interview' })));
      const { router, journal } = setup({ gemini, claude });

      const result = router.runTask('classify_emails', INPUT);
      await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS);

      await expect(result).resolves.toMatchObject({ provider: 'claude' });
      expect(journal[0]).toMatchObject({
        provider: 'gemini',
        outcome: 'timeout',
        durationMs: LLM_TIMEOUT_MS,
      });
    });

    it('[EF-IA-11] asks the local model for at most its ceiling of output tokens, and the others for what they were asked', async () => {
      const local = fakeProvider('local', () => Promise.resolve(answer({ category: 'interview' })), {
        maxOutputTokens: 2_000,
      });
      const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
      const onLocal = setup({ local, gemini }, LOCAL_FIRST);
      const onHosted = setup({ gemini });

      await onLocal.router.runTask('score_offers', INPUT);
      await onHosted.router.runTask('classify_emails', INPUT);

      expect(local.complete.mock.calls[0]?.[0].maxOutputTokens).toBe(2_000);
      // EF-IA-11: a hosted provider keeps the current ceiling (16 000 by default).
      expect(gemini.complete.mock.calls[0]?.[0].maxOutputTokens).toBe(16_000);
    });

    it('[EF-IA-11] keeps the smaller bound when a task asks for fewer tokens than the ceiling, and cuts a larger one', async () => {
      const local = fakeProvider('local', () => Promise.resolve(answer({ category: 'interview' })), {
        maxOutputTokens: 2_000,
      });
      const { router } = setup({ local }, LOCAL_FIRST);

      await router.runTask('score_offers', { ...INPUT, maxOutputTokens: 500 });
      await router.runTask('score_offers', { ...INPUT, maxOutputTokens: 9_000 });

      expect(local.complete.mock.calls.map(([request]) => request.maxOutputTokens)).toEqual([500, 2_000]);
    });

    it('[EF-IA-02] [EF-IA-10] still gives the task to the next provider when the local model fails', async () => {
      const local = fakeProvider('local', () => Promise.reject(new Error('connection refused')), {
        timeoutMs: LOCAL_DELAY_MS,
      });
      const gemini = fakeProvider('gemini', () => Promise.resolve(answer({ category: 'interview' })));
      const { router, journal } = setup({ local, gemini }, LOCAL_FIRST);

      await expect(router.runTask('score_offers', INPUT)).resolves.toMatchObject({ provider: 'gemini' });
      expect(journal.map((entry) => [entry.provider, entry.outcome])).toEqual([
        ['local', 'error'],
        ['gemini', 'success'],
      ]);
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

describe('routes by mode (T-1003, v1.35)', () => {
  const CONNECTION_FAILURE = () =>
    Object.assign(new Error('the model server could not be reached'), { connection: true });
  const ok = () => Promise.resolve(answer({ category: 'interview' }));
  const LOCAL_LIMITS = { batchSize: 5, descriptionChars: 800 };

  it('[EF-IA-08] puts the local model first for the scoring and the extraction of a scheduled pass, the hosted providers behind', () => {
    expect(SCHEDULED_ROUTES.score_offers).toEqual(['local', ...TASK_ROUTES.score_offers]);
    expect(SCHEDULED_ROUTES.extract_offers).toEqual(['local', ...TASK_ROUTES.extract_offers]);
  });

  it('[EF-IA-08] [RG-13] puts the local model first for the deduction of a profile and the choice of an offer, and never in an attended run', () => {
    // The CV types are read in the queue, nobody waits at the screen: the local model leads, the hosted ones follow.
    expect(SCHEDULED_ROUTES.deduce_profile).toEqual(['local', ...TASK_ROUTES.deduce_profile]);
    expect(TASK_ROUTES.deduce_profile).not.toContain('local');
    expect(TASK_ROUTES.deduce_profile.slice(-2)).toEqual(['gemini', 'claude']);
  });

  it.each(['classify_emails', 'diagnose_cv', 'tailor_cv', 'write_motivation', 'write_follow_up'] as const)(
    '[EF-IA-09] leaves the route of %s as it is, in a scheduled pass too',
    (task) => {
      expect(SCHEDULED_ROUTES[task]).toEqual(TASK_ROUTES[task]);
      expect(SCHEDULED_ROUTES[task]).not.toContain('local');
    },
  );

  it('[EF-IA-08] sends the first call of a scheduled pass to the local model, and the same task asked in an attended run to the hosted ones', async () => {
    const local = fakeProvider('local', ok);
    const gemini = fakeProvider('gemini', ok);
    const { router } = setup({ local, gemini });

    await router.forMode('scheduled').runTask('score_offers', INPUT);
    expect(local.complete).toHaveBeenCalledTimes(1);
    expect(gemini.complete).not.toHaveBeenCalled();

    await router.runTask('score_offers', INPUT);
    expect(local.complete).toHaveBeenCalledTimes(1);
    expect(gemini.complete).toHaveBeenCalledTimes(1);
  });

  it('[EF-IA-08] gives a scheduled task to the next provider when the local model fails, and runs without the local model when none is configured', async () => {
    const local = fakeProvider('local', () => Promise.reject(new Error('model refused')));
    const gemini = fakeProvider('gemini', ok);

    const failing = setup({ local, gemini });
    await expect(failing.router.forMode('scheduled').runTask('score_offers', INPUT)).resolves.toMatchObject({
      provider: 'gemini',
    });
    const without = setup({ gemini });
    await expect(without.router.forMode('scheduled').runTask('score_offers', INPUT)).resolves.toMatchObject({
      provider: 'gemini',
    });
  });

  it('[EF-IA-14] stops calling the local model for the rest of a pass after two connection failures', async () => {
    const local = fakeProvider('local', () => Promise.reject(CONNECTION_FAILURE()));
    const gemini = fakeProvider('gemini', ok);
    const { router } = setup({ local, gemini });
    const pass = router.forMode('scheduled');

    for (let call = 0; call < 5; call += 1) await pass.runTask('score_offers', INPUT);

    expect(local.complete).toHaveBeenCalledTimes(2);
    expect(gemini.complete).toHaveBeenCalledTimes(5);
    // The next pass tries the local model again.
    await router.forMode('scheduled').runTask('score_offers', INPUT);
    expect(local.complete).toHaveBeenCalledTimes(3);
  });

  it('[EF-IA-14] counts only consecutive connection failures: an answer, or a refusal of another kind, starts over', async () => {
    let call = 0;
    const local = fakeProvider('local', () => {
      call += 1;
      if (call === 2) return ok();
      if (call === 4) return Promise.reject(new Error('answer outside the schema'));
      return Promise.reject(CONNECTION_FAILURE());
    });
    const gemini = fakeProvider('gemini', ok);
    const pass = setup({ local, gemini }).router.forMode('scheduled');

    for (let step = 0; step < 6; step += 1) await pass.runTask('score_offers', INPUT);

    // failure, answer, failure, refusal, failure, failure → the breaker opens only on the last two.
    expect(local.complete).toHaveBeenCalledTimes(6);
  });

  it('[EF-IA-12] sizes the batches by the first provider of the route: the local limits while it serves, the hosted ones otherwise', async () => {
    const local = fakeProvider('local', () => Promise.reject(CONNECTION_FAILURE()), {
      batchLimits: LOCAL_LIMITS,
    });
    const gemini = fakeProvider('gemini', ok);
    const { router } = setup({ local, gemini });
    const pass = router.forMode('scheduled');

    expect(pass.limitsFor('score_offers')).toEqual(LOCAL_LIMITS);
    expect(router.limitsFor('score_offers')).toEqual({ batchSize: 15, descriptionChars: 2_000 });
    expect(pass.limitsFor('classify_emails')).toEqual({ batchSize: 15, descriptionChars: 2_000 });

    await pass.runTask('score_offers', INPUT);
    await pass.runTask('score_offers', INPUT);
    // Local down for two calls: the hosted limits are back for the batches that remain.
    expect(pass.limitsFor('score_offers')).toEqual({ batchSize: 15, descriptionChars: 2_000 });
  });

  it('[EF-IA-12] takes the hosted limits when the local model is not configured', () => {
    const { router } = setup({ gemini: fakeProvider('gemini', ok) });

    expect(router.forMode('scheduled').limitsFor('score_offers')).toEqual({
      batchSize: 15,
      descriptionChars: 2_000,
    });
  });
});
