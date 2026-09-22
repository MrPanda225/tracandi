import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createScriptedClassifier } from '../fixtures/llm/classifications.js';
import { createTestContext, openTestDatabase, registerUser, type TestContext, truncateAll } from './context.js';

const database = openTestDatabase();
let context: TestContext;

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database, { aiProviders: { gemini: createScriptedClassifier('gemini').provider } });
});

afterAll(async () => {
  await database.close();
});

describe('GET /api/settings/ai', () => {
  it('[EF-CFG-02] shows the configured providers and the providers of each task', async () => {
    const cookie = await registerUser(context.app, 'alice@example.com');

    const response = await request(context.app).get('/api/settings/ai').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      providers: [{ name: 'gemini', model: 'gemini-test' }],
      tasks: expect.arrayContaining([{ task: 'classify_emails', providers: ['gemini'] }]) as unknown,
    });
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await request(context.app).get('/api/settings/ai')).status).toBe(401);
  });
});
