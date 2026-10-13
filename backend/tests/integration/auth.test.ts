import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountActivations, loginChallenges, sessions, users } from '../../src/db/schema.js';
import {
  createFakeMailer,
  createTestContext,
  lastActivationCodeSentTo,
  lastLoginCodeSentTo,
  logInUser,
  openTestDatabase,
  registerUser,
  sessionCookieOf,
  TEST_USER_PASSWORD,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;

const post = (path: string, body: object) =>
  request(context.app).post(path).set('Content-Type', 'application/json').send(body);

const PASSWORD = TEST_USER_PASSWORD;

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/auth/register', () => {
  it('[EF-AUT-01] [EF-AUT-14] creates the account inactive, with its settings, and opens no session', async () => {
    const response = await post('/api/auth/register', {
      email: 'Alex.Martin@Example.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: expect.any(Number) as unknown });
    expect(response.headers['set-cookie']).toBeUndefined();
    const [stored] = await database.db.select({ activatedAt: users.activatedAt }).from(users);
    expect(stored?.activatedAt).toBeNull();
  });

  it('[EF-AUT-14] sends a single-use activation link to the address, valid 15 minutes', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    expect(context.mailer.sentEmails).toHaveLength(1);
    const [sent] = context.mailer.sentEmails;
    expect(sent?.to).toBe('alex@example.com');
    expect(sent?.html).toContain('/activation?code=');
    const [activation] = await database.db.select().from(accountActivations);
    expect(activation?.expiresAt.getTime() ?? 0).toBeCloseTo(
      new Date(context.clock.now().getTime() + 15 * 60 * 1000).getTime(),
      -2,
    );
  });

  it('[ENF-RGP-15] sends Resend only the address and the prepared message, never the password', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    const [sent] = context.mailer.sentEmails;
    expect(Object.keys(sent ?? {}).sort()).toEqual(['html', 'subject', 'to']);
    expect(sent?.html).not.toContain(PASSWORD);
    expect(JSON.stringify(sent)).not.toContain(PASSWORD);
  });

  it('[ENF-SEC-26] stores only the digest of the activation token, never the raw value', async () => {
    const response = await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const code = lastActivationCodeSentTo('alex@example.com');

    expect(code).toBeDefined();
    const [activation] = await database.db
      .select({ tokenHash: accountActivations.tokenHash, userId: accountActivations.userId })
      .from(accountActivations);
    expect(activation?.userId).toBe(response.body.id);
    expect(activation?.tokenHash).toHaveLength(32);
    expect(activation?.tokenHash.toString('base64url')).not.toBe(code);
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

  it('[EF-AUT-14] rolls the account back and answers 502 when the activation e-mail cannot be sent', async () => {
    const failing = createTestContext(database, {
      mailer: { sentEmails: [], send: () => Promise.reject(new Error('Resend: over quota')) },
    });

    const response = await request(failing.app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });

    expect(response.status).toBe(502);
    expect(await database.db.select().from(users)).toHaveLength(0);
    // Retryable: the address is free again rather than stuck on a 409.
    const retry = await request(failing.app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });
    expect(retry.status).toBe(502);
  });
});

describe('POST /api/auth/activate', () => {
  it('[EF-AUT-14] activates the account and lets it log in', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const code = lastActivationCodeSentTo('alex@example.com') ?? '';

    const activate = await post('/api/auth/activate', { code });
    const login = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    expect(activate.status).toBe(204);
    expect(login.status).toBe(200);
    const [stored] = await database.db.select({ activatedAt: users.activatedAt }).from(users);
    expect(stored?.activatedAt).not.toBeNull();
  });

  it('[EF-AUT-14] refuses an unknown code with a distinct code, so the screen can tell it apart', async () => {
    const response = await post('/api/auth/activate', { code: 'un-code-qui-n-existe-pas' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('activation_code_invalid');
  });

  it('[EF-AUT-14] [ENF-SEC-26] refuses an expired code (15 minutes), expiry not exceeded', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const code = lastActivationCodeSentTo('alex@example.com') ?? '';
    context.clock.advanceMinutes(15);

    const response = await post('/api/auth/activate', { code });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('activation_code_expired');
  });

  it('[EF-AUT-14] [ENF-SEC-26] accepts a code just before its expiry', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const code = lastActivationCodeSentTo('alex@example.com') ?? '';
    context.clock.advanceMinutes(14.98);

    const response = await post('/api/auth/activate', { code });

    expect(response.status).toBe(204);
  });

  it('[ENF-SEC-26] refuses a code already consumed, with a distinct code', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const code = lastActivationCodeSentTo('alex@example.com') ?? '';
    await post('/api/auth/activate', { code });

    const second = await post('/api/auth/activate', { code });

    expect(second.status).toBe(400);
    expect(second.body.code).toBe('activation_code_already_used');
  });

  it('[ENF-SEC-04] rejects a missing code with 400', async () => {
    const response = await post('/api/auth/activate', {});

    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/activate/resend', () => {
  it('[EF-AUT-15] sends a fresh code, invalidating the previous one', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    const firstCode = lastActivationCodeSentTo('alex@example.com') ?? '';

    const resend = await post('/api/auth/activate/resend', { email: 'alex@example.com' });
    const secondCode = lastActivationCodeSentTo('alex@example.com') ?? '';

    expect(resend.status).toBe(204);
    expect(secondCode).not.toBe(firstCode);
    expect((await post('/api/auth/activate', { code: firstCode })).status).toBe(400);
    expect((await post('/api/auth/activate', { code: secondCode })).status).toBe(204);
  });

  it('[EF-AUT-15] answers identically for an address without any account (never reveals it)', async () => {
    const response = await post('/api/auth/activate/resend', { email: 'personne@example.com' });

    expect(response.status).toBe(204);
    expect(context.mailer.sentEmails).toHaveLength(0);
  });

  it('[EF-AUT-15] sends nothing for an already activated account, but still answers 204', async () => {
    await registerUser(context.app, 'alex@example.com');
    context.mailer.sentEmails.length = 0;

    const response = await post('/api/auth/activate/resend', { email: 'alex@example.com' });

    expect(response.status).toBe(204);
    expect(context.mailer.sentEmails).toHaveLength(0);
  });

  it('[EF-AUT-15] refuses the fourth request within a minute for the same address with 429', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });

    const attempts = await Promise.all(
      Array.from({ length: 3 }, () => post('/api/auth/activate/resend', { email: 'alex@example.com' })),
    );
    const fourth = await post('/api/auth/activate/resend', { email: 'alex@example.com' });

    for (const attempt of attempts) expect(attempt.status).toBe(204);
    expect(fourth.status).toBe(429);
  });

  it('[EF-AUT-15] [ENF-COU-03] also limits the resend per caller, whatever the addresses it rotates through', async () => {
    const attempts = Array.from({ length: 10 }, (_, index) =>
      post('/api/auth/activate/resend', { email: `inconnu${String(index)}@example.com` }),
    );
    for (const attempt of attempts) expect((await attempt).status).toBe(204);

    const eleventh = await post('/api/auth/activate/resend', { email: 'autre@example.com' });

    expect(eleventh.status).toBe(429);
    expect(context.mailer.sentEmails).toHaveLength(0);
  });

  it('[EF-AUT-15] limits each address on its own, not every resend together', async () => {
    await post('/api/auth/register', { email: 'alex@example.com', password: PASSWORD });
    await post('/api/auth/register', { email: 'sam@example.com', password: PASSWORD });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await post('/api/auth/activate/resend', { email: 'alex@example.com' });
    }

    const response = await post('/api/auth/activate/resend', { email: 'sam@example.com' });

    expect(response.status).toBe(204);
  });

  it('[ENF-RGP-15] [ENF-SEC-26] carries only the fresh digest, never the previous one, for the same user', async () => {
    const mailer = createFakeMailer();
    const withOwnMailer = createTestContext(database, { mailer });
    await request(withOwnMailer.app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });
    const [before] = await database.db
      .select({ tokenHash: accountActivations.tokenHash })
      .from(accountActivations);

    await request(withOwnMailer.app)
      .post('/api/auth/activate/resend')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com' });
    const [after] = await database.db
      .select({ tokenHash: accountActivations.tokenHash })
      .from(accountActivations);

    expect(after?.tokenHash.equals(before?.tokenHash ?? Buffer.alloc(0))).toBe(false);
    expect(await database.db.select().from(accountActivations)).toHaveLength(1);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser(context.app, 'alex@example.com');
  });

  it('[EF-AUT-03] [EF-AUT-16] answers 200 with a challenge and no session cookie for valid credentials', async () => {
    const response = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ challenge: expect.any(String) as unknown });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('[EF-AUT-16] e-mails a six-digit code, valid 10 minutes, to the address', async () => {
    context.mailer.sentEmails.length = 0;

    await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    const [sent] = context.mailer.sentEmails;
    expect(sent?.to).toBe('alex@example.com');
    expect(sent?.subject).toBe('Votre code de connexion Tracandi');
    expect(lastLoginCodeSentTo('alex@example.com')).toMatch(/^\d{6}$/);
    const [challenge] = await database.db.select().from(loginChallenges);
    expect(challenge?.expiresAt.getTime()).toBe(context.clock.now().getTime() + 10 * 60 * 1000);
  });

  it('[ENF-RGP-15] sends Resend only the address and the message, never the password or the challenge', async () => {
    context.mailer.sentEmails.length = 0;

    const login = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    const [sent] = context.mailer.sentEmails;
    expect(Object.keys(sent ?? {}).sort()).toEqual(['html', 'subject', 'to']);
    expect(JSON.stringify(sent)).not.toContain(PASSWORD);
    expect(JSON.stringify(sent)).not.toContain((login.body as { challenge: string }).challenge);
  });

  it('[ENF-SEC-26] stores only digests: neither the challenge token nor the code, nor a bare digest of the code', async () => {
    const login = await post('/api/auth/login', { email: 'alex@example.com', password: PASSWORD });

    const [stored] = await database.db.select().from(loginChallenges);
    const challenge = (login.body as { challenge: string }).challenge;
    const code = lastLoginCodeSentTo('alex@example.com') ?? '';
    expect(stored?.tokenHash).toHaveLength(32);
    expect(stored?.codeHash).toHaveLength(32);
    expect(stored?.tokenHash.equals(createHash('sha256').update(challenge).digest())).toBe(true);
    expect(stored?.codeHash.equals(createHash('sha256').update(code).digest())).toBe(false);
  });

  it('[EF-AUT-16] sends no code for a wrong password or an inactive account', async () => {
    await post('/api/auth/register', { email: 'sam@example.com', password: PASSWORD });
    context.mailer.sentEmails.length = 0;

    await post('/api/auth/login', { email: 'alex@example.com', password: 'mauvais mot de passe' });
    await post('/api/auth/login', { email: 'sam@example.com', password: PASSWORD });

    expect(context.mailer.sentEmails).toHaveLength(0);
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
  });

  it('[EF-AUT-16] deletes the challenge and answers 502 when the code cannot be sent, so the login can be retried', async () => {
    let failing = false;
    const mailer = createFakeMailer();
    const flaky = createTestContext(database, {
      mailer: {
        sentEmails: mailer.sentEmails,
        send: (email) => (failing ? Promise.reject(new Error('Resend: over quota')) : mailer.send(email)),
      },
    });
    failing = true;

    const response = await request(flaky.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });

    expect(response.status).toBe(502);
    expect(response.body.error).toMatch(/code de connexion/);
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
    failing = false;
    const retry = await request(flaky.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });
    expect(retry.status).toBe(200);
  });

  it('[EF-AUT-14] refuses a correct password for an inactive account with 403 account_not_activated', async () => {
    await post('/api/auth/register', { email: 'sam@example.com', password: PASSWORD });

    const response = await post('/api/auth/login', { email: 'sam@example.com', password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('account_not_activated');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('[EF-AUT-14] still answers 401, not 403, for a wrong password on an inactive account', async () => {
    await post('/api/auth/register', { email: 'sam@example.com', password: PASSWORD });

    const response = await post('/api/auth/login', {
      email: 'sam@example.com',
      password: 'mot de passe erroné',
    });

    expect(response.status).toBe(401);
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

const startLogin = async (email = 'alex@example.com'): Promise<string> => {
  const login = await post('/api/auth/login', { email, password: PASSWORD });
  return (login.body as { challenge: string }).challenge;
};

describe('POST /api/auth/login/verify', () => {
  beforeEach(async () => {
    await registerUser(context.app, 'alex@example.com');
  });

  it('[EF-AUT-16] opens the session, answering with the account, when the code is right', async () => {
    const challenge = await startLogin();
    const code = lastLoginCodeSentTo('alex@example.com') ?? '';

    const response = await post('/api/auth/login/verify', { challenge, code });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email: 'alex@example.com' });
    const me = await request(context.app).get('/api/auth/me').set('Cookie', sessionCookieOf(response));
    expect(me.status).toBe(200);
  });

  it('[EF-AUT-16] opens no session before the code is confirmed', async () => {
    const before = await database.db.select().from(sessions);

    await startLogin();

    expect(await database.db.select().from(sessions)).toHaveLength(before.length);
  });

  it('[ENF-SEC-26] consumes the challenge: the same code cannot be used twice', async () => {
    const challenge = await startLogin();
    const code = lastLoginCodeSentTo('alex@example.com') ?? '';
    await post('/api/auth/login/verify', { challenge, code });

    const again = await post('/api/auth/login/verify', { challenge, code });

    expect(again.status).toBe(401);
    expect(again.body.code).toBe('login_code_expired');
    expect(again.headers['set-cookie']).toBeUndefined();
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
  });

  it('[EF-AUT-16] refuses a wrong code with 401 login_code_invalid and no session', async () => {
    const challenge = await startLogin();
    const wrong = lastLoginCodeSentTo('alex@example.com') === '000000' ? '000001' : '000000';

    const response = await post('/api/auth/login/verify', { challenge, code: wrong });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('login_code_invalid');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('[EF-AUT-16] counts a code of the wrong shape as a wrong code, and a missing challenge field as a 400', async () => {
    const challenge = await startLogin();

    const malformed = await post('/api/auth/login/verify', { challenge, code: 'abc' });
    const empty = await post('/api/auth/login/verify', { challenge, code: '' });
    const missing = await post('/api/auth/login/verify', { code: '123456' });

    expect(malformed.status).toBe(401);
    expect(empty.status).toBe(401);
    expect(missing.status).toBe(400);
    const [stored] = await database.db.select().from(loginChallenges);
    expect(stored?.failedAttempts).toBe(2);
  });

  it('[EF-AUT-16] refuses an unknown challenge as an expired one', async () => {
    const response = await post('/api/auth/login/verify', { challenge: 'inconnu', code: '123456' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('login_code_expired');
  });

  it('[ENF-SEC-26] refuses a right code at 10 minutes, and accepts it just before', async () => {
    const early = await startLogin();
    const earlyCode = lastLoginCodeSentTo('alex@example.com') ?? '';
    context.clock.advanceMinutes(9.98);
    expect((await post('/api/auth/login/verify', { challenge: early, code: earlyCode })).status).toBe(200);

    const late = await startLogin();
    const lateCode = lastLoginCodeSentTo('alex@example.com') ?? '';
    context.clock.advanceMinutes(10);
    const response = await post('/api/auth/login/verify', { challenge: late, code: lateCode });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('login_code_expired');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('[ENF-SEC-26] invalidates the code at the fifth consecutive wrong attempt, even if the right one follows', async () => {
    const challenge = await startLogin();
    const code = lastLoginCodeSentTo('alex@example.com') ?? '';
    const wrong = code === '000000' ? '000001' : '000000';
    const answers: { status: number; code: string }[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await post('/api/auth/login/verify', { challenge, code: wrong });
      answers.push({ status: response.status, code: response.body.code as string });
    }

    expect(answers.slice(0, 4).every((a) => a.code === 'login_code_invalid')).toBe(true);
    expect(answers[4]).toEqual({ status: 401, code: 'login_code_locked' });
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
    const right = await post('/api/auth/login/verify', { challenge, code });
    expect(right.status).toBe(401);
    expect(right.headers['set-cookie']).toBeUndefined();
  });

  it('[ENF-SEC-26] still accepts the right code after four wrong attempts', async () => {
    const challenge = await startLogin();
    const code = lastLoginCodeSentTo('alex@example.com') ?? '';
    const wrong = code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 4; attempt += 1)
      await post('/api/auth/login/verify', { challenge, code: wrong });

    const response = await post('/api/auth/login/verify', { challenge, code });

    expect(response.status).toBe(200);
  });

  it('[ENF-SEC-19] limits the codes typed per caller: the 11th attempt answers 429', async () => {
    const challenge = await startLogin();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await post('/api/auth/login/verify', { challenge: 'inconnu', code: '123456' });
    }

    const response = await post('/api/auth/login/verify', { challenge, code: '123456' });

    expect(response.status).toBe(429);
  });

  it('[EF-AUT-11] deleting the account removes its pending challenges', async () => {
    await startLogin();
    const cookie = await logInUser(context.app, 'alex@example.com');

    const deleted = await request(context.app)
      .delete('/api/auth/account')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookie)
      .send({ password: PASSWORD });

    expect(deleted.status).toBe(204);
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
  });
});

describe('POST /api/auth/login/resend', () => {
  beforeEach(async () => {
    await registerUser(context.app, 'alex@example.com');
  });

  it('[EF-AUT-17] sends a new code that replaces the previous one', async () => {
    const challenge = await startLogin();
    const first = lastLoginCodeSentTo('alex@example.com') ?? '';
    context.mailer.sentEmails.length = 0;

    const resend = await post('/api/auth/login/resend', { challenge });
    const second = lastLoginCodeSentTo('alex@example.com') ?? '';

    expect(resend.status).toBe(204);
    expect(context.mailer.sentEmails).toHaveLength(1);
    if (first !== second) {
      expect((await post('/api/auth/login/verify', { challenge, code: first })).status).toBe(401);
    }
    expect((await post('/api/auth/login/verify', { challenge, code: second })).status).toBe(200);
  });

  it('[EF-AUT-17] extends the validity by ten minutes but keeps the failed attempts', async () => {
    const challenge = await startLogin();
    const wrong = lastLoginCodeSentTo('alex@example.com') === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 3; attempt += 1)
      await post('/api/auth/login/verify', { challenge, code: wrong });
    context.clock.advanceMinutes(5);

    await post('/api/auth/login/resend', { challenge });

    const [stored] = await database.db.select().from(loginChallenges);
    expect(stored?.failedAttempts).toBe(3);
    expect(stored?.expiresAt.getTime()).toBe(context.clock.now().getTime() + 10 * 60 * 1000);
  });

  it('[ENF-SEC-26] allows five wrong codes in total, resends included', async () => {
    const challenge = await startLogin();
    const wrongFor = (sent: string) => (sent === '000000' ? '000001' : '000000');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await post('/api/auth/login/verify', {
        challenge,
        code: wrongFor(lastLoginCodeSentTo('alex@example.com') ?? ''),
      });
    }
    await post('/api/auth/login/resend', { challenge });
    const wrong = wrongFor(lastLoginCodeSentTo('alex@example.com') ?? '');

    const fourth = await post('/api/auth/login/verify', { challenge, code: wrong });
    const fifth = await post('/api/auth/login/verify', { challenge, code: wrong });

    expect(fourth.body.code).toBe('login_code_invalid');
    expect(fifth.body.code).toBe('login_code_locked');
    expect(await database.db.select().from(loginChallenges)).toHaveLength(0);
  });

  it('[ENF-SEC-26] never extends a challenge past 30 minutes after the password was checked', async () => {
    const challenge = await startLogin();
    const startedAt = context.clock.now().getTime();
    for (const minutes of [8, 8, 9]) {
      context.clock.advanceMinutes(minutes);
      await post('/api/auth/login/resend', { challenge });
    }

    const [stored] = await database.db.select().from(loginChallenges);
    expect(context.clock.now().getTime()).toBe(startedAt + 25 * 60 * 1000);
    expect(stored?.expiresAt.getTime()).toBe(startedAt + 30 * 60 * 1000);
  });

  it('[ENF-SEC-26] sends nothing for a resend after the 30 minutes, whatever the earlier resends', async () => {
    const challenge = await startLogin();
    for (const minutes of [8, 8, 9]) {
      context.clock.advanceMinutes(minutes);
      await post('/api/auth/login/resend', { challenge });
    }
    context.clock.advanceMinutes(6);
    context.mailer.sentEmails.length = 0;

    const response = await post('/api/auth/login/resend', { challenge });

    expect(response.status).toBe(204);
    expect(context.mailer.sentEmails).toHaveLength(0);
  });

  it('[EF-AUT-17] answers 204 and sends nothing for an unknown or expired challenge', async () => {
    const challenge = await startLogin();
    context.clock.advanceMinutes(10);
    context.mailer.sentEmails.length = 0;

    const unknown = await post('/api/auth/login/resend', { challenge: 'inconnu' });
    const expired = await post('/api/auth/login/resend', { challenge });

    expect(unknown.status).toBe(204);
    expect(expired.status).toBe(204);
    expect(context.mailer.sentEmails).toHaveLength(0);
  });

  it('[EF-AUT-17] refuses the fourth request within a minute for the same challenge with 429', async () => {
    const challenge = await startLogin();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await post('/api/auth/login/resend', { challenge })).status);
    }

    expect(statuses).toEqual([204, 204, 204, 429]);
  });

  it('[EF-AUT-17] limits each challenge on its own', async () => {
    const first = await startLogin();
    for (let attempt = 0; attempt < 4; attempt += 1)
      await post('/api/auth/login/resend', { challenge: first });
    const second = await startLogin();

    expect((await post('/api/auth/login/resend', { challenge: second })).status).toBe(204);
  });

  it('[EF-AUT-17] still answers 204 when the e-mail cannot be sent', async () => {
    let failing = false;
    const mailer = createFakeMailer();
    const flaky = createTestContext(database, {
      mailer: {
        sentEmails: mailer.sentEmails,
        send: (email) => (failing ? Promise.reject(new Error('Resend: over quota')) : mailer.send(email)),
      },
    });
    const login = await request(flaky.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'alex@example.com', password: PASSWORD });
    failing = true;

    const response = await request(flaky.app)
      .post('/api/auth/login/resend')
      .set('Content-Type', 'application/json')
      .send({ challenge: (login.body as { challenge: string }).challenge });

    expect(response.status).toBe(204);
  });

  it('[ENF-SEC-04] rejects a missing challenge with 400', async () => {
    expect((await post('/api/auth/login/resend', {})).status).toBe(400);
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

describe('GET /api/auth/session', () => {
  it('[EF-AUT-13] answers 200 with the account of a valid session', async () => {
    const cookie = await registerUser(context.app, 'alex@example.com');

    const response = await request(context.app).get('/api/auth/session').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      account: { id: expect.any(Number) as unknown, email: 'alex@example.com' },
    });
  });

  it('[EF-AUT-13] answers 200 with no account without a cookie or with an unknown one', async () => {
    const withoutCookie = await request(context.app).get('/api/auth/session');
    const unknownCookie = await request(context.app)
      .get('/api/auth/session')
      .set('Cookie', 'tracandi_session=inconnu');

    expect(withoutCookie.status).toBe(200);
    expect(withoutCookie.body).toEqual({ account: null });
    expect(unknownCookie.status).toBe(200);
    expect(unknownCookie.body).toEqual({ account: null });
  });

  it('[EF-AUT-13] [EF-AUT-07] answers 200 with no account once the session has expired or the account is gone', async () => {
    const expired = await registerUser(context.app, 'alex@example.com');
    const orphan = await registerUser(context.app, 'sam@example.com');
    await database.db.delete(users).where(eq(users.email, 'sam@example.com'));
    context.clock.advanceDays(7);

    const afterExpiry = await request(context.app).get('/api/auth/session').set('Cookie', expired);
    const afterDeletion = await request(context.app).get('/api/auth/session').set('Cookie', orphan);

    expect(afterExpiry.body).toEqual({ account: null });
    expect(afterDeletion.body).toEqual({ account: null });
  });
});
