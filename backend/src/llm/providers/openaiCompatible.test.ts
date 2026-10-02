import { describe, expect, it, vi } from 'vitest';
import {
  CONNECT_TIMEOUT_MS,
  connectLocal,
  createOpenAiCompatibleProvider,
  GROQ_BASE_URL,
} from './openaiCompatible.js';

const REQUEST = {
  system: 'Classe les messages.',
  prompt: '<email>Entretien lundi</email>',
  maxOutputTokens: 16_000,
  signal: new AbortController().signal,
};

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const completion = {
  choices: [{ message: { role: 'assistant', content: '{"messages":[]}' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 350, completion_tokens: 42 },
};

const providerWith = (fetchImpl: typeof fetch) =>
  createOpenAiCompatibleProvider({
    name: 'groq_1',
    model: 'openai/gpt-oss-120b',
    baseUrl: GROQ_BASE_URL,
    apiKey: 'gsk-test-key',
    fetchImpl,
  });

describe('createOpenAiCompatibleProvider', () => {
  it('[EF-IA-01] sends the instruction and the prompt to the chat completions endpoint, JSON answer asked', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    const result = await providerWith(fetchImpl).complete(REQUEST);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.signal).toBe(REQUEST.signal);
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'openai/gpt-oss-120b',
      max_tokens: 16_000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Classe les messages.' },
        { role: 'user', content: '<email>Entretien lundi</email>' },
      ],
    });
    expect(result).toEqual({ text: '{"messages":[]}', inputTokens: 350, outputTokens: 42 });
  });

  it('[ENF-SEC-03] carries the key in the Authorization header only, never in the address', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    await providerWith(fetchImpl).complete(REQUEST);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('gsk-test-key');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer gsk-test-key' });
  });

  it('[ENF-FIA-10] fails with the status of the service, so that an overload is asked again', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(answer({ error: { message: 'Over capacity', type: 'internal_server_error' } }, 503)),
    );

    const failure = await providerWith(fetchImpl)
      .complete(REQUEST)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ status: 503 });
    expect((failure as Error).message).toContain('Over capacity');
  });

  it('[EF-IA-02] fails when the answer holds no text, so that the router falls back', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer({ choices: [], usage: {} })));

    await expect(providerWith(fetchImpl).complete(REQUEST)).rejects.toThrow(/no text/);
  });

  it('[EF-IA-02] fails when the service answers outside its own format', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 200 })),
    );

    await expect(providerWith(fetchImpl).complete(REQUEST)).rejects.toThrow();
  });

  it('[EF-IA-06] reports no token count when the service gives none', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer({ choices: [{ message: { content: '{}' } }] })));

    expect(await providerWith(fetchImpl).complete(REQUEST)).toEqual({
      text: '{}',
      inputTokens: null,
      outputTokens: null,
    });
  });
});

// T-1001 (v1.35): the local model of the operator, behind its own address and token.
const LOCAL_CONFIG = {
  apiKey: 'local-secret-token',
  model: 'qwen3.5:4b',
  baseUrl: 'http://192.168.1.54:11434/v1',
  timeoutMs: 600_000,
  maxOutputTokens: 2_000,
  batchSize: 5,
  descriptionChars: 800,
};

/** The call to the chat completions endpoint: the local provider first asks whether the server is there. */
const chatCall = (fetchImpl: ReturnType<typeof vi.fn>): [string, RequestInit] => {
  const call = (fetchImpl.mock.calls as [string, RequestInit][]).find(([url]) =>
    url.endsWith('/chat/completions'),
  );
  if (!call) throw new Error('no call to the chat completions endpoint');
  return call;
};

describe('connectLocal', () => {
  it('[EF-IA-07] calls the address of the configuration, under the name « local », with the token of the configuration', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    const provider = connectLocal(LOCAL_CONFIG, fetchImpl);
    await provider.complete(REQUEST);

    expect(provider).toMatchObject({ name: 'local', model: 'qwen3.5:4b' });
    const [url, init] = chatCall(fetchImpl);
    expect(url).toBe('http://192.168.1.54:11434/v1/chat/completions');
    // ENF-SEC-24
    expect(init.headers).toMatchObject({ Authorization: 'Bearer local-secret-token' });
  });

  it('[EF-IA-10] [EF-IA-11] carries the delay and the output ceiling of the configuration, for the router to apply', () => {
    const provider = connectLocal(LOCAL_CONFIG, vi.fn());

    expect(provider).toMatchObject({ timeoutMs: 600_000, maxOutputTokens: 2_000 });
  });

  it('[EF-IA-10] leaves the hosted providers without a limit of their own: the router defaults apply', () => {
    const provider = providerWith(vi.fn());

    expect(provider).not.toHaveProperty('timeoutMs');
    expect(provider).not.toHaveProperty('maxOutputTokens');
  });

  it('[EF-IA-07] asks the model not to reason: its reasoning would use up the output ceiling and leave no answer', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    await connectLocal(LOCAL_CONFIG, fetchImpl).complete(REQUEST);

    const [, init] = chatCall(fetchImpl);
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'qwen3.5:4b',
      response_format: { type: 'json_object' },
      reasoning_effort: 'none',
    });
  });

  it('[EF-IA-07] sends the reasoning setting to the local model only: the hosted services refuse that value', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    await providerWith(fetchImpl).complete(REQUEST);

    const [, init] = chatCall(fetchImpl);
    expect(JSON.parse(String(init.body))).not.toHaveProperty('reasoning_effort');
  });

  it('[ENF-SEC-25] fails without the address nor the token when the server cannot be reached', async () => {
    const unreachable = Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED 192.168.1.54:11434'), { address: '192.168.1.54' }),
    });
    const fetchImpl = vi.fn(() => Promise.reject(unreachable));

    const failure = await connectLocal(LOCAL_CONFIG, fetchImpl)
      .complete(REQUEST)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    const shown = `${String(failure)} ${JSON.stringify(failure)} ${String((failure as Error).cause)} ${(failure as Error).stack ?? ''}`;
    expect(shown).not.toMatch(/192\.168\.1\.54|local-secret-token/);
    expect((failure as Error).message).toContain('qwen3.5:4b');
  });

  it('[ENF-SEC-25] keeps the abort of the router recognisable: a timeout stays a timeout', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = connectLocal(LOCAL_CONFIG, fetchImpl as unknown as typeof fetch)
      .complete({ ...REQUEST, signal: controller.signal })
      .catch((error: unknown) => error);
    controller.abort();

    expect(controller.signal.aborted).toBe(true);
    expect(await pending).toBeInstanceOf(Error);
  });

  it('[ENF-FIA-10] still fails with the HTTP status of the server, so that an overload is asked again', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer({ error: { message: 'model is loading' } }, 503)));

    const failure = await connectLocal(LOCAL_CONFIG, fetchImpl)
      .complete(REQUEST)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 503 });
  });

  it('[EF-IA-13] asks first whether the server is there, with the same token, then sends the request', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(answer(completion)));

    await connectLocal(LOCAL_CONFIG, fetchImpl).complete(REQUEST);

    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => `${init.method ?? 'GET'} ${url}`)).toEqual([
      'GET http://192.168.1.54:11434/v1/models',
      'POST http://192.168.1.54:11434/v1/chat/completions',
    ]);
    expect(calls[0]?.[1].headers).toMatchObject({ Authorization: 'Bearer local-secret-token' });
  });

  it('[EF-IA-13] counts any answer of the server as « reachable », even a refusal of the question', async () => {
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(url.endsWith('/models') ? answer({ error: 'not found' }, 404) : answer(completion)),
    );

    await expect(
      connectLocal(LOCAL_CONFIG, fetchImpl as unknown as typeof fetch).complete(REQUEST),
    ).resolves.toMatchObject({ text: '{"messages":[]}' });
  });

  it('[EF-IA-13] fails as a connection failure, without the address, when the server cannot be reached; the request is not sent', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('connect ECONNREFUSED 192.168.1.54:11434')));

    const failure = await connectLocal(LOCAL_CONFIG, fetchImpl)
      .complete(REQUEST)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ connection: true });
    expect(String(failure)).not.toMatch(/192\.168\.1\.54/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('[EF-IA-13] gives up after 10 seconds on a server that does not answer, whatever the delay of the call', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = connectLocal(LOCAL_CONFIG, fetchImpl as unknown as typeof fetch)
      .complete(REQUEST)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toMatchObject({ connection: true });
    expect(CONNECT_TIMEOUT_MS).toBe(10_000);
    vi.useRealTimers();
  });

  it('[EF-IA-14] marks a failure of the request itself as a connection failure, and never a refusal of the server', async () => {
    const down = vi.fn((url: string) =>
      url.endsWith('/models') ? Promise.resolve(answer({})) : Promise.reject(new TypeError('fetch failed')),
    );
    const refusing = vi.fn(() => Promise.resolve(answer({ error: { message: 'model is loading' } }, 503)));

    const lost = await connectLocal(LOCAL_CONFIG, down as unknown as typeof fetch)
      .complete(REQUEST)
      .catch((error: unknown) => error);
    const refused = await connectLocal(LOCAL_CONFIG, refusing)
      .complete(REQUEST)
      .catch((error: unknown) => error);

    expect(lost).toMatchObject({ connection: true });
    expect(refused).not.toHaveProperty('connection');
  });

  it('[EF-IA-12] carries the size of its batches and the length of its descriptions, for the router to read', () => {
    expect(connectLocal(LOCAL_CONFIG, vi.fn())).toMatchObject({
      batchLimits: { batchSize: 5, descriptionChars: 800 },
    });
    expect(providerWith(vi.fn())).not.toHaveProperty('batchLimits');
  });
});
