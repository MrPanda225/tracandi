import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gmailAccounts, users } from '../../src/db/schema.js';
import { decryptSecret } from '../../src/lib/crypto.js';
import { GmailAccessRefusedError, type GoogleOAuth } from '../../src/modules/emails/googleOAuth.js';
import { OAUTH_STATE_TTL_MS } from '../../src/modules/emails/oauthState.js';
import { OAUTH_MAX_REQUESTS } from '../../src/modules/emails/routes.js';
import {
  createTestContext,
  FRONTEND_ORIGIN,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
const SETTINGS = `${FRONTEND_ORIGIN}/reglages`;

let context: TestContext;
let google: { [K in keyof GoogleOAuth]: ReturnType<typeof vi.fn> & GoogleOAuth[K] };
let alice: string;
let bob: string;

const fakeGoogle = () => ({
  authorizationUrl: vi.fn((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
  exchangeCode: vi.fn((code: string) => {
    if (code === 'unticked-scope') return Promise.reject(new GmailAccessRefusedError());
    if (code === 'google-down') return Promise.reject(new Error('503 from Google'));
    const emailAddress = code === 'other-mailbox' ? 'other.box@example.com' : 'alice.candidate@example.com';
    return Promise.resolve({ refreshToken: `1//refresh-token-${code}`, emailAddress });
  }),
  revoke: vi.fn(() => Promise.resolve()),
});

const api = (cookie: string) => ({
  get: (path: string) => request(context.app).get(path).set('Cookie', cookie),
  delete: (path: string) =>
    request(context.app).delete(path).set('Cookie', cookie).set('Content-Type', 'application/json'),
});

/** Asks for the consent URL as a signed-in user and returns the state it carries. */
const issueState = async (cookie: string): Promise<string> => {
  const response = await api(cookie).get('/api/gmail/authorization-url');
  expect(response.status).toBe(200);
  const state = new URL((response.body as { url: string }).url).searchParams.get('state');
  if (!state) throw new Error('no state in the consent URL');
  return state;
};

/** Google's redirection back to the API: a top-level navigation, without the session cookie. */
const callback = (query: Record<string, string>) =>
  request(context.app).get('/api/gmail/callback').query(query);

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

const accountOf = async (email: string) => {
  const [account] = await database.db
    .select()
    .from(gmailAccounts)
    .where(eq(gmailAccounts.userId, await userIdOf(email)));
  return account ?? null;
};

const connectAlice = async (code = 'granted') => callback({ code, state: await issueState(alice) });

beforeEach(async () => {
  await truncateAll(database);
  google = fakeGoogle() as typeof google;
  context = createTestContext(database, { google });
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('Gmail connection', () => {
  it('[EF-GML-01] gives a signed-in user the address of Google’s consent page, with a fresh state', async () => {
    const first = await issueState(alice);
    const second = await issueState(alice);

    expect(first).not.toBe(second);
    expect(google.authorizationUrl).toHaveBeenCalledWith(first);
  });

  it.each([
    ['get', '/api/gmail/authorization-url'],
    ['get', '/api/gmail/status'],
    ['delete', '/api/gmail/connection'],
  ] as const)('[EF-AUT-05] refuses %s %s without a session', async (method, path) => {
    const response = await request(context.app)[method](path).set('Content-Type', 'application/json');

    expect(response.status).toBe(401);
  });

  it('[EF-GML-01] [EF-CFG-01] shows the connected address to this user only, after Google’s consent', async () => {
    const response = await connectAlice();

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${SETTINGS}?gmail=connected`);
    expect((await api(alice).get('/api/gmail/status')).body).toEqual({
      connected: true,
      emailAddress: 'alice.candidate@example.com',
      connectedAt: '2026-09-22T08:00:00.000Z',
      lastSyncAt: null,
      applyLabels: true,
      authorizationExpired: false,
    });
    expect((await api(bob).get('/api/gmail/status')).body).toEqual({ connected: false });
  });

  it('[ENF-SEC-02] stores the refresh token encrypted with AES-256-GCM, never in clear', async () => {
    await connectAlice();

    const account = await accountOf('alice@example.com');
    expect(account).not.toBeNull();
    if (!account) return;
    expect(account.refreshTokenEnc.toString('utf8')).not.toContain('refresh-token');
    expect(
      decryptSecret(
        { ciphertext: account.refreshTokenEnc, iv: account.tokenIv, tag: account.tokenTag },
        context.encryptionKey,
      ),
    ).toBe('1//refresh-token-granted');
  });

  it.each([
    ['without state', {}],
    ['with a forged state', { state: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }],
  ])('[ENF-SEC-14] rejects Google’s answer %s: nothing exchanged, nothing stored', async (_case, query) => {
    await issueState(alice);

    const response = await callback({ code: 'granted', ...query });

    expect(response.headers.location).toBe(`${SETTINGS}?gmail=expired`);
    expect(google.exchangeCode).not.toHaveBeenCalled();
    expect(await accountOf('alice@example.com')).toBeNull();
  });

  it('[ENF-SEC-14] rejects a state issued more than 10 minutes ago', async () => {
    const state = await issueState(alice);
    context.clock.set(new Date(context.clock.now().getTime() + OAUTH_STATE_TTL_MS + 1000));

    const response = await callback({ code: 'granted', state });

    expect(response.headers.location).toBe(`${SETTINGS}?gmail=expired`);
    expect(google.exchangeCode).not.toHaveBeenCalled();
  });

  it('[ENF-SEC-14] accepts a state only once', async () => {
    const state = await issueState(alice);
    await callback({ code: 'granted', state });

    const replay = await callback({ code: 'granted', state });

    expect(replay.headers.location).toBe(`${SETTINGS}?gmail=expired`);
    expect(google.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it('[EF-GML-01] tells the user that access was refused on Google, or the Gmail permission unticked', async () => {
    const denied = await callback({ error: 'access_denied', state: await issueState(alice) });
    const unticked = await connectAlice('unticked-scope');

    expect(denied.headers.location).toBe(`${SETTINGS}?gmail=refused`);
    expect(unticked.headers.location).toBe(`${SETTINGS}?gmail=refused`);
    expect(await accountOf('alice@example.com')).toBeNull();
  });

  it('[EF-GML-01] tells the user when Google fails, and stores nothing', async () => {
    const response = await connectAlice('google-down');

    expect(response.headers.location).toBe(`${SETTINGS}?gmail=failed`);
    expect(await accountOf('alice@example.com')).toBeNull();
  });

  it('[EF-GML-01] keeps one connection per user: reconnecting the same mailbox keeps its sync state', async () => {
    await connectAlice();
    const lastSyncAt = new Date('2026-09-22T07:30:00.000Z');
    await database.db
      .update(gmailAccounts)
      .set({ historyId: '4242', lastSyncAt })
      .where(eq(gmailAccounts.userId, await userIdOf('alice@example.com')));

    await connectAlice('second-consent');

    const account = await accountOf('alice@example.com');
    expect(account).toMatchObject({ historyId: '4242', lastSyncAt });
    expect(
      account &&
        decryptSecret(
          { ciphertext: account.refreshTokenEnc, iv: account.tokenIv, tag: account.tokenTag },
          context.encryptionKey,
        ),
    ).toBe('1//refresh-token-second-consent');
  });

  it('[EF-GML-01] starts the synchronisation over when another mailbox is connected', async () => {
    await connectAlice();
    await database.db
      .update(gmailAccounts)
      .set({ historyId: '4242', lastSyncAt: new Date('2026-09-22T07:30:00.000Z') })
      .where(eq(gmailAccounts.userId, await userIdOf('alice@example.com')));

    await connectAlice('other-mailbox');

    expect(await accountOf('alice@example.com')).toMatchObject({
      emailAddress: 'other.box@example.com',
      historyId: null,
      lastSyncAt: null,
    });
  });

  it('[EF-GML-02] revokes the connection: the token is revoked at Google and no token remains', async () => {
    await connectAlice();

    const response = await api(alice).delete('/api/gmail/connection');

    expect(response.status).toBe(204);
    expect(google.revoke).toHaveBeenCalledWith('1//refresh-token-granted');
    expect(await accountOf('alice@example.com')).toBeNull();
    expect((await api(alice).get('/api/gmail/status')).body).toEqual({ connected: false });
  });

  it('[EF-GML-02] removes the token even when Google cannot be reached for the revocation', async () => {
    await connectAlice();
    google.revoke.mockRejectedValueOnce(new Error('network down'));

    expect((await api(alice).delete('/api/gmail/connection')).status).toBe(204);
    expect(await accountOf('alice@example.com')).toBeNull();
  });

  it('[ENF-SEC-14] limits the answers to Google’s redirection, against guessing a state', async () => {
    for (let attempt = 0; attempt < OAUTH_MAX_REQUESTS; attempt += 1) {
      expect((await callback({ code: 'x', state: `forged-${attempt}` })).status).toBe(302);
    }

    expect((await callback({ code: 'x', state: 'forged-last' })).status).toBe(429);
  });

  it('[EF-AUT-06] never lets a user revoke another user’s connection', async () => {
    await connectAlice();

    expect((await api(bob).delete('/api/gmail/connection')).status).toBe(204);
    expect(await accountOf('alice@example.com')).not.toBeNull();
    expect(google.revoke).not.toHaveBeenCalled();
  });
});
