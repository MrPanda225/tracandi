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
const prompts: string[] = [];

const board = {
  jobs: [
    {
      id: 1,
      title: 'Data Analyst',
      absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/1',
      location: { name: 'Nanterre' },
      metadata: [],
      content: '&lt;p&gt;SQL. 8 ans d’expérience exigés.&lt;/p&gt;',
      updated_at: '2026-09-18T08:00:00Z',
    },
  ],
};

const collect: AdapterDeps['fetch'] = (url) =>
  Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(board) });

const scoringAi: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: ({ system, prompt }) => {
    prompts.push(system);
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({ offers: refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' })) }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
};

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

const passWith = async (criteria: Record<string, unknown>) => {
  prompts.length = 0;
  await send('/api/watch/criteria', { ...CRITERIA, ...criteria }, 'put').expect(200);
  await send('/api/sites/run', {}).expect(202);
  await context.queue.drain();
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database, { collect, aiProviders: { gemini: scoringAi } });
  alice = await registerUser(context.app, 'alice@example.com');
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

describe('scoring by the level of the candidate (T-1007)', () => {
  it('[EF-VEI-50] [EF-VEI-47] saves the years, works out the level and gives it back', async () => {
    const saved = await send('/api/watch/criteria', { ...CRITERIA, years: 9 }, 'put').expect(200);

    expect(saved.body).toMatchObject({ criteria: { years: 9, level: 'senior' } });
    const read = await request(context.app).get('/api/watch/criteria').set('Cookie', alice);
    expect(read.body).toMatchObject({ criteria: { years: 9, level: 'senior' } });
  });

  it('[EF-VEI-50] [RG-09] carries the level of the candidate in the scoring prompt, in place of the limit of three years', async () => {
    await passWith({ years: 9 });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('8 ans ou plus');
    expect(prompts[0]).not.toContain('trois ans');
  });

  it('[EF-VEI-50] [RG-09] keeps the limit of three years for criteria without a level', async () => {
    await passWith({});

    expect(prompts[0]).toContain('trois ans');
  });

  it('[EF-VEI-50] [RG-09] carries the level of a junior as well: the offer is judged against 0 to 2 years', async () => {
    await passWith({ years: 1 });

    expect(prompts[0]).toContain('de 0 à 2 ans');
    expect(prompts[0]).not.toContain('8 ans ou plus');
  });
});
