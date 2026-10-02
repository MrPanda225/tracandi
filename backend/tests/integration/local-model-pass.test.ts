import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;
let board: { jobs: unknown[] };
const calls: { provider: string; refs: number[]; prompt: string }[] = [];
let localDown = false;

const LONG_TAIL = 'FIN-DE-LA-DESCRIPTION';
const job = (id: number) => ({
  id,
  title: `Data Analyst ${String(id)}`,
  absolute_url: `https://boards.greenhouse.io/atelieraurore/jobs/${String(id)}`,
  location: { name: 'Nanterre' },
  metadata: [],
  content: `&lt;p&gt;SQL. ${'x'.repeat(1_200)}${LONG_TAIL}&lt;/p&gt;`,
  updated_at: '2026-09-18T08:00:00Z',
});

const collect: AdapterDeps['fetch'] = (url) =>
  Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(board) });

const scoring = (name: LlmProvider['name']): LlmProvider => ({
  name,
  model: `${name}-test`,
  ...(name === 'local' ? { batchLimits: { batchSize: 5, descriptionChars: 800 } } : {}),
  complete: ({ prompt }) => {
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    calls.push({ provider: name, refs, prompt });
    if (name === 'local' && localDown) {
      return Promise.reject(
        Object.assign(new Error('the model server could not be reached'), { connection: true }),
      );
    }
    return Promise.resolve({
      text: JSON.stringify({ offers: refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' })) }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
});

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['data', 'analyst'], contractTypes: ['cdi'] }],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

const send = (path: string, body: unknown, method: 'post' | 'put' = 'post') => {
  const test = method === 'post' ? request(context.app).post(path) : request(context.app).put(path);
  return test
    .set('Cookie', alice)
    .set('Content-Type', 'application/json')
    .send(body as object);
};

/** The scheduled pass, as the scheduler starts it at 7, 13 and 19 o'clock (EF-VEI-06). */
const scheduledPass = async () => {
  await context.watch.checkEverySource();
  await context.queue.drain();
};

const callsOf = (provider: string) => calls.filter((call) => call.provider === provider);

beforeEach(async () => {
  calls.length = 0;
  localDown = false;
  board = { jobs: Array.from({ length: 12 }, (_unused, index) => job(index + 1)) };
  await truncateAll(database);
  context = createTestContext(database, {
    collect,
    aiProviders: { local: scoring('local'), gemini: scoring('gemini') },
  });
  alice = await registerUser(context.app, 'alice@example.com');
  await send('/api/watch/criteria', CRITERIA, 'put').expect(200);
  await send('/api/sites', {
    companyName: 'Atelier Aurore',
    adapter: 'greenhouse',
    identifier: 'atelieraurore',
  }).expect(201);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('scheduled pass with the local model (T-1003)', () => {
  it('[EF-IA-08] [EF-IA-12] scores twelve offers at the local model, five at a time, with descriptions cut to 800 characters', async () => {
    await scheduledPass();

    expect(callsOf('local').map((call) => call.refs.length)).toEqual([5, 5, 2]);
    expect(callsOf('gemini')).toHaveLength(0);
    expect(callsOf('local').every((call) => !call.prompt.includes(LONG_TAIL))).toBe(true);
  });

  it('[EF-IA-13] [EF-IA-14] falls back to the hosted provider when the local model is down, and stops asking the local one after two failures', async () => {
    localDown = true;

    await scheduledPass();

    expect(callsOf('local')).toHaveLength(2);
    // Five and five offers while the local limits stood; the two left are read with the hosted limits.
    expect(callsOf('gemini').map((call) => call.refs.length)).toEqual([5, 5, 2]);
  });

  it('[EF-IA-09] leaves the hosted providers first when the candidate asks for the pass himself, in batches of 15', async () => {
    await send('/api/sites/run', {}).expect(202);
    await context.queue.drain();

    expect(callsOf('local')).toHaveLength(0);
    expect(callsOf('gemini').map((call) => call.refs.length)).toEqual([12]);
    // The hosted providers keep the 2 000 characters of a description.
    expect(callsOf('gemini').every((call) => call.prompt.includes(LONG_TAIL))).toBe(true);
  });
});
