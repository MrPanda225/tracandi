import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createScriptedClassifier } from '../fixtures/llm/classifications.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database, {
    aiProviders: {
      groq_1: createScriptedClassifier('groq_1').provider,
      gemini: createScriptedClassifier('gemini').provider,
    },
  });
});

afterAll(async () => {
  await database.close();
});

describe('GET /api/settings/ai', () => {
  it('[EF-CFG-02] shows the configured providers and the providers of each task', async () => {
    const cookie = await registerUser(context.app, 'alice@example.com');

    const response = await request(context.app).get('/api/settings/ai').set('Cookie', cookie);

    expect(response.status).toBe(200);
    // RG-13 (v1.7): the free Groq model leads, Gemini is its fallback; the ones left out are not shown.
    expect(response.body).toMatchObject({
      providers: [
        { name: 'groq_1', model: 'groq_1-test' },
        { name: 'gemini', model: 'gemini-test' },
      ],
      tasks: expect.arrayContaining([
        { task: 'classify_emails', providers: ['groq_1', 'gemini'] },
        { task: 'tailor_cv', providers: ['groq_1', 'gemini'] },
      ]) as unknown,
    });
  });

  it('[EF-IA-07] [ENF-SEC-25] lists the local model by its name, without any address, and gives it no task yet', async () => {
    const withLocal = createTestContext(database, {
      aiProviders: {
        local: { ...createScriptedClassifier('local').provider, model: 'qwen3.5:4b' },
        groq_1: createScriptedClassifier('groq_1').provider,
      },
    });
    const cookie = await registerUser(withLocal.app, 'bob@example.com');

    const response = await request(withLocal.app).get('/api/settings/ai').set('Cookie', cookie);

    expect(response.status).toBe(200);
    const body = response.body as {
      providers: { name: string; model: string }[];
      tasks: { providers: string[] }[];
    };
    expect(body.providers).toEqual([
      { name: 'local', model: 'qwen3.5:4b' },
      { name: 'groq_1', model: 'groq_1-test' },
    ]);
    expect(body.tasks.every((task) => !task.providers.includes('local'))).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/http|token|192\.168/);
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await request(context.app).get('/api/settings/ai')).status).toBe(401);
  });
});
