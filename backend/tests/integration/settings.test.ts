import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createScriptedClassifier } from '../fixtures/llm/classifications.js';
import { createTestContext, openTestDatabase, registerUser, type TestContext, truncateAll } from './context.js';

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

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await request(context.app).get('/api/settings/ai')).status).toBe(401);
  });
});
