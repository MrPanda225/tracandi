import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, openTestDatabase, registerUser, truncateAll } from './context.js';

const database = openTestDatabase();

beforeEach(async () => {
  await truncateAll(database);
});

afterAll(async () => {
  await database.close();
});

describe('optional features (ENF-MAI-07)', () => {
  it('[ENF-MAI-07] a deployment without the watch nor the CV exposes none of their routes', async () => {
    const { app } = createTestContext(database, { features: new Set() });
    const cookie = await registerUser(app, 'alice@example.com');

    for (const path of [
      '/api/profile',
      '/api/cv-workshop/analyses/1',
      '/api/sites',
      '/api/sites/suggestions',
      '/api/watch/criteria',
    ]) {
      expect((await request(app).get(path).set('Cookie', cookie)).status, path).toBe(404);
    }
    const run = await request(app)
      .post('/api/sites/run')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({});
    expect(run.status).toBe(404);
    const analysis = await request(app)
      .post('/api/cv-workshop/analyses')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({ file: 'JVBERi0=' });
    expect(analysis.status).toBe(404);
    // The core stays: applications, dashboard, Gmail settings.
    expect((await request(app).get('/api/applications').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get('/api/gmail/status').set('Cookie', cookie)).status).toBe(200);
  });

  it('[ENF-MAI-07] [EF-TDB-08] the dashboard leaves the offers out when the watch is disabled', async () => {
    const { app } = createTestContext(database, { features: new Set(['cv']) });
    const cookie = await registerUser(app, 'alice@example.com');

    const response = await request(app).get('/api/stats/dashboard').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect((response.body as { offers: unknown }).offers).toBeNull();
  });

  it('[ENF-MAI-07] tells the interface which optional features are enabled', async () => {
    const { app } = createTestContext(database, { features: new Set(['watch']) });
    const cookie = await registerUser(app, 'alice@example.com');

    const response = await request(app).get('/api/settings/features').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ features: ['watch'] });
  });

  it('[EF-AUT-05] refuses the list of features without a session', async () => {
    const { app } = createTestContext(database);

    expect((await request(app).get('/api/settings/features')).status).toBe(401);
  });
});
