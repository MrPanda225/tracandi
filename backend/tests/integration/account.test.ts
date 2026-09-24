import { eq } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import type { GoogleOAuth } from '../../src/modules/emails/googleOAuth.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import {
  createTestContext,
  giveContact,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';
import { testDatabaseUrl } from './test-database.js';

const PASSWORD = 'une phrase de passe longue';
// Every table holding rows of one user, directly or through a parent (RG: deletion cascades).
const USER_TABLES = [
  'sessions',
  'app_settings',
  'candidate_profiles',
  'companies',
  'applications',
  'application_status_history',
  'processed_messages',
  'emails',
  'gmail_accounts',
  'gmail_labels',
  'prefilter_keywords',
  'watched_sites',
  'job_offers',
  'job_runs',
  'llm_calls',
];

const database = openTestDatabase();
const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 1 });
let context: TestContext;
let google: GoogleOAuth & { revoke: ReturnType<typeof vi.fn> };
let alice: string;
let aliceId: number;

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`no user ${email}`);
  return user.id;
};

/** Alice with a Gmail connection, one application and one message kept from her mailbox. */
const seedAlice = async () => {
  await saveGmailAccount(database.db, {
    userId: aliceId,
    emailAddress: 'alice.martin@example.com',
    refreshToken: encryptSecret('1//refresh-token-alice', context.encryptionKey),
    connectedAt: new Date('2026-09-20T09:00:00.000Z'),
    resetSync: true,
  });
  const created = await request(context.app)
    .post('/api/applications')
    .set('Cookie', alice)
    .set('Content-Type', 'application/json')
    .send({ companyName: 'Atelier Nova', jobTitle: 'Data Analyst', status: 'sent', notes: 'Rappeler lundi' });
  await giveContact(database, {
    userId: aliceId,
    applicationId: (created.body as { id: number }).id,
    address: 'rh@atelier-nova.example',
  });
};

// Who owns a row of each table: directly, or through its company, application or site. Fixed SQL, no input.
const OWNED_BY: Readonly<Record<string, string>> = {
  applications: 'company_id in (select id from companies where user_id = $1)',
  watched_sites: 'company_id in (select id from companies where user_id = $1)',
  application_status_history:
    'application_id in (select a.id from applications a join companies c on c.id = a.company_id where c.user_id = $1)',
  job_offers:
    'site_id in (select w.id from watched_sites w join companies c on c.id = w.company_id where c.user_id = $1)',
};

const rowsOf = async (table: string, userId: number): Promise<number> => {
  const result = await pool.query<{ count: string }>(
    `select count(*) from ${table} where ${OWNED_BY[table] ?? 'user_id = $1'}`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
};

beforeEach(async () => {
  await truncateAll(database);
  google = {
    authorizationUrl: (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
    exchangeCode: () => Promise.reject(new Error('not used')),
    revoke: vi.fn(() => Promise.resolve()),
  };
  context = createTestContext(database, { google });
  alice = await registerUser(context.app, 'alice@example.com');
  aliceId = await userIdOf('alice@example.com');
});

afterAll(async () => {
  await pool.end();
  await database.close();
});

describe('GET /api/account/export (EF-AUT-12)', () => {
  it('[EF-AUT-12] hands over every datum held on the user, as a JSON file to download', async () => {
    await seedAlice();

    const response = await request(context.app).get('/api/account/export').set('Cookie', alice);

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="tracandi-donnees-\d{4}-\d{2}-\d{2}\.json"$/);
    const data = JSON.parse(response.text) as Record<string, unknown>;
    expect(data).toMatchObject({
      account: { email: 'alice@example.com' },
      gmail: { emailAddress: 'alice.martin@example.com' },
      companies: [
        {
          name: 'Atelier Nova',
          applications: [
            {
              jobTitle: 'Data Analyst',
              notes: 'Rappeler lundi',
              statusHistory: [expect.objectContaining({ status: 'sent' })],
              emails: [expect.objectContaining({ contactAddress: 'rh@atelier-nova.example' })],
            },
          ],
        },
      ],
    });
    for (const key of ['settings', 'profile', 'watchedSites', 'processedMessages', 'aiUsage', 'executions']) {
      expect(data).toHaveProperty(key);
    }
  });

  it('[EF-AUT-12] [ENF-SEC-02] never hands over a secret', async () => {
    await seedAlice();

    const text = (await request(context.app).get('/api/account/export').set('Cookie', alice)).text;

    for (const secret of ['passwordHash', 'password_hash', 'refreshToken', 'tokenHash', 'refresh-token-alice', 'scrypt$']) {
      expect(text).not.toContain(secret);
    }
  });

  it('[EF-AUT-06] hands over nothing of another user', async () => {
    await seedAlice();
    const bob = await registerUser(context.app, 'bob@example.com');

    const text = (await request(context.app).get('/api/account/export').set('Cookie', bob)).text;

    expect(text).not.toContain('Atelier Nova');
    expect(text).not.toContain('alice');
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await request(context.app).get('/api/account/export')).status).toBe(401);
  });
});

describe('DELETE /api/auth/account (EF-AUT-11)', () => {
  const deleteAccount = (password: string, cookie = alice) =>
    request(context.app)
      .delete('/api/auth/account')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send({ password });

  it('[EF-AUT-11] [ENF-RGP-02] deletes every datum of the user and revokes the Gmail access at Google', async () => {
    await seedAlice();
    const bob = await registerUser(context.app, 'bob@example.com');
    const bobId = await userIdOf('bob@example.com');

    const response = await deleteAccount(PASSWORD);

    expect(response.status).toBe(204);
    expect(google.revoke).toHaveBeenCalledWith('1//refresh-token-alice');
    for (const table of USER_TABLES) expect(await rowsOf(table, aliceId), table).toBe(0);
    expect(await database.db.select({ id: users.id }).from(users).where(eq(users.id, aliceId))).toEqual([]);
    // The other accounts are untouched.
    expect(await rowsOf('app_settings', bobId)).toBe(1);
    expect((await request(context.app).get('/api/auth/me').set('Cookie', bob)).status).toBe(200);
  });

  it('[EF-AUT-11] closes the sessions at once, the one in use included, and clears the cookie', async () => {
    // A session already resolved once: it sits in the cache of the authentication.
    expect((await request(context.app).get('/api/auth/me').set('Cookie', alice)).status).toBe(200);

    const response = await deleteAccount(PASSWORD);

    expect(String(response.headers['set-cookie'])).toMatch(/tracandi_session=;/);
    expect((await request(context.app).get('/api/auth/me').set('Cookie', alice)).status).toBe(401);
  });

  it('[EF-AUT-11] deletes the account even when Google cannot be told', async () => {
    await seedAlice();
    google.revoke.mockRejectedValueOnce(new Error('network down'));

    expect((await deleteAccount(PASSWORD)).status).toBe(204);
    expect(await rowsOf('gmail_accounts', aliceId)).toBe(0);
  });

  it('[EF-AUT-11] deletes nothing with a wrong password', async () => {
    await seedAlice();

    const response = await deleteAccount('un autre mot de passe');

    expect(response.status).toBe(403);
    expect(await rowsOf('companies', aliceId)).toBe(1);
    expect(google.revoke).not.toHaveBeenCalled();
  });

  it('[ENF-SEC-04] refuses a request without password', async () => {
    const response = await request(context.app)
      .delete('/api/auth/account')
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({});

    expect(response.status).toBe(400);
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    const response = await request(context.app)
      .delete('/api/auth/account')
      .set('Content-Type', 'application/json')
      .send({ password: PASSWORD });

    expect(response.status).toBe(401);
  });
});
