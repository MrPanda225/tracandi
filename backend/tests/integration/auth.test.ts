import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sessions, users } from '../../src/db/schema.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  sessionCookieOf,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;

const post = (path: string, body: object) =>
  request(context.app).post(path).set('Content-Type', 'application/json').send(body);

const PASSWORD = 'une phrase de passe longue';

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/auth/register', () => {
  it('[EF-AUT-01] creates the account with its settings and opens a session', async () => {
    const response = await post('/api/auth/register', {
      email: 'Alex.Martin@Example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(Number) as unknown });
    const me = await request(context.app).get('/api/auth/me').set('Cookie', sessionCookieOf(response));
    expect(me.body).toEqual({ id: response.body.id as number, email: 'alex.martin@example.com' });
  });

  it('[EF-AUT-03] sets an HttpOnly, SameSite=Strict, Secure session cookie limited to /api', async () => {
    const response = await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    const cookie = (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\/api/);
  });

  it('[EF-AUT-01] rejects an email already used, whatever its case, with 409', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    const response = await post('/api/auth/register', { email: 'ALEX@example.com', password: PASSWORD });

    expect(response.status).toBe(409);
  });

  it.each([
    ['a'.repeat(11), 400],
    ['a'.repeat(129), 400],
    ['a'.repeat(12), 201],
  ])('[EF-AUT-02] password of %s characters → %i', async (password, status) => {
    const response = await post('/api/auth/register', { email: 'alex@example.com', password });

    expect(response.status).toBe(status);
  });

  it('[ENF-SEC-04] rejects an invalid email and unknown fields with 400', async () => {
    const response = await post('/api/auth/register', { email: 'nope', password: PASSWORD, isAdmin: true });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'body.email' }),
        expect.objectContaining({ path: 'body' }),
      ]),
    );
  });

  it('[ENF-SEC-18] stores a scrypt hash, never the password', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    const [stored] = await database.db.select({ hash: users.passwordHash }).from(users);
    expect(stored?.hash).toMatch(/^scrypt\$/);
    expect(stored?.hash).not.toContain(PASSWORD);
  });

  it('[ENF-SEC-20] stores only the digest of the session token', async () => {
    const response = await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const token = sessionCookieOf(response).split('=')[1] ?? '';

    const [stored] = await database.db.select({ tokenHash: sessions.tokenHash }).from(sessions);
    expect(stored?.tokenHash).toHaveLength(32);
    expect(stored?.tokenHash.toString('base64url')).not.toBe(token);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser(context.app, 'alex@example.com');
  });

  it('[EF-AUT-03] opens a session with valid credentials', async () => {
    const response = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: 'alex@example.com' });
    const me = await request(context.app).get('/api/auth/me').set('Cookie', sessionCookieOf(response));
    expect(me.status).toBe(200);
  });

  it('[ENF-SEC-19] answers identically for a wrong password and an unknown email', async () => {
    const wrongPassword = await post('/api/auth/login', {
      email: 'alex@example.com',
      password: 'mauvais mot de passe',
    });
    const unknownEmail = await post('/api/auth/login', { email: 'nobody@example.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('[ENF-SEC-19] [BES-39] behind the hosting proxies, limits each visitor, not the proxy they share', async () => {
    const behindProxies = createTestContext(database, { trustProxyHops: 2 });
    // The client as seen by Vercel, then Vercel as seen by Northflank's load balancer.
    const loginFrom = (client: string, password: string) =>
      request(behindProxies.app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .set('X-Forwarded-For', `${client}, 10.0.0.1`)
        .send({ email: 'alex@example.com', password });
    for (let attempt = 0; attempt < 10; attempt += 1) await loginFrom('203.0.113.7', 'mauvais mot de passe');

    expect((await loginFrom('203.0.113.7', PASSWORD)).status).toBe(429);
    expect((await loginFrom('198.51.100.9', PASSWORD)).status).toBe(200);
  });

  it('[ENF-SEC-19] blocks the 11th attempt within 15 minutes with 429', async () => {
    const attempts = Array.from({ length: 10 }, () =>
      post('/api/auth/login', { email: 'alex@example.com', password: 'mauvais mot de passe' }),
    );
    for (const attempt of attempts) await attempt;

    const response = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    expect(response.status).toBe(429);
  });
});

describe('POST /api/auth/logout', () => {
  it('[EF-AUT-04] invalidates the session on the server side', async () => {
    const cookie = await registerUser(context.app, 'alex@example.com');

    const logout = await request(context.app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookie);
    const after = await request(context.app).get('/api/auth/me').set('Cookie', cookie);

    expect(logout.status).toBe(204);
    expect(after.status).toBe(401);
    expect(await database.db.select().from(sessions)).toHaveLength(0);
  });

  it('[EF-AUT-04] succeeds without any session', async () => {
    const response = await request(context.app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(204);
  });
});

describe('session lifetime', () => {
  it('[EF-AUT-07] accepts the session just before 7 days and rejects it at 7 days', async () => {
    const cookie = await registerUser(context.app, 'alex@example.com');

    context.clock.advanceDays(6.99);
    const before = await request(context.app).get('/api/auth/me').set('Cookie', cookie);
    context.clock.advanceDays(0.01);
    const after = await request(context.app).get('/api/auth/me').set('Cookie', cookie);

    expect(before.status).toBe(200);
    expect(after.status).toBe(401);
  });

  it('[EF-AUT-05] rejects a deleted account session', async () => {
    const cookie = await registerUser(context.app, 'alex@example.com');
    await database.db.delete(users).where(eq(users.email, 'alex@example.com'));

    const response = await request(context.app).get('/api/auth/me').set('Cookie', cookie);

    expect(response.status).toBe(401);
  });
});
