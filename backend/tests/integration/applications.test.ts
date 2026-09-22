import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applicationStatusHistory,
  applications,
  companies,
  emails,
  processedMessages,
  users,
} from '../../src/db/schema.js';
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
let alice: string;
let bob: string;

const api = (cookie: string) => ({
  get: (path: string) => request(context.app).get(path).set('Cookie', cookie),
  post: (path: string, body: object) =>
    request(context.app).post(path).set('Cookie', cookie).set('Content-Type', 'application/json').send(body),
  patch: (path: string, body: object) =>
    request(context.app).patch(path).set('Cookie', cookie).set('Content-Type', 'application/json').send(body),
  delete: (path: string) =>
    request(context.app).delete(path).set('Cookie', cookie).set('Content-Type', 'application/json'),
});

const createApplication = async (cookie: string, body: Record<string, unknown>): Promise<number> => {
  const response = await api(cookie).post('/api/applications', { status: 'sent', ...body });
  if (response.status !== 201)
    throw new Error(`create failed: ${response.status} ${JSON.stringify(response.body)}`);
  return (response.body as { id: number }).id;
};

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

/** Stores a message as the Gmail sync (lot 3) will, directly in the database. */
const insertEmail = async (
  email: string,
  message: {
    gmailId: string;
    applicationId: number | null;
    category: 'acknowledged' | 'interview' | 'rejected' | 'job_alert';
    receivedAt: string;
  },
): Promise<number> => {
  const userId = await userIdOf(email);
  await database.db
    .insert(processedMessages)
    .values({ userId, gmailMessageId: message.gmailId, outcome: 'retained' });
  const [row] = await database.db
    .insert(emails)
    .values({
      userId,
      gmailMessageId: message.gmailId,
      gmailThreadId: `thread-${message.gmailId}`,
      applicationId: message.applicationId,
      direction: 'inbound',
      subject: `Objet ${message.gmailId}`,
      snippet: 'Extrait',
      category: message.category,
      receivedAt: new Date(message.receivedAt),
    })
    .returning({ id: emails.id });
  if (!row) throw new Error('email insert failed');
  return row.id;
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/applications', () => {
  it('[EF-CAN-06] creates an application visible in the list', async () => {
    const response = await api(alice).post('/api/applications', {
      companyName: "McDonald's",
      jobTitle: 'Équipier polyvalent',
      status: 'sent',
      contractType: 'job_etudiant',
    });

    expect(response.status).toBe(201);
    const list = await api(alice).get('/api/applications');
    expect(list.body).toMatchObject({
      total: 1,
      items: [
        {
          id: response.body.id as number,
          company: { name: "McDonald's" },
          jobTitle: 'Équipier polyvalent',
          status: 'sent',
          contractType: 'job_etudiant',
          source: 'manual',
          isFollowUpDue: false,
        },
      ],
    });
  });

  it('[RG-14] reuses the same company for names with the same normalized key', async () => {
    await createApplication(alice, { companyName: "McDonald's", jobTitle: 'Équipier' });
    await createApplication(alice, { companyName: "  MCDONALD'S ", jobTitle: 'Caissier' });

    expect(await database.db.select().from(companies)).toHaveLength(1);
  });

  it('[RG-03] rejects a second application with the same normalized job title in the same company with 409', async () => {
    await createApplication(alice, { companyName: 'Innova', jobTitle: 'Data Analyst' });

    const response = await api(alice).post('/api/applications', {
      companyName: 'innova',
      jobTitle: 'DATA-analyst',
      status: 'sent',
    });

    expect(response.status).toBe(409);
  });

  it('[EF-CAN-08] rejects a note of 2 001 characters with 400', async () => {
    const response = await api(alice).post('/api/applications', {
      companyName: 'Innova',
      jobTitle: 'Data Analyst',
      status: 'sent',
      notes: 'x'.repeat(2001),
    });

    expect(response.status).toBe(400);
  });

  it('[EF-CAN-13] rejects a contract type outside the list with 400', async () => {
    const response = await api(alice).post('/api/applications', {
      companyName: 'Innova',
      jobTitle: 'Data Analyst',
      status: 'sent',
      contractType: 'stage',
    });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual([expect.objectContaining({ path: 'body.contractType' })]);
  });

  it('[EF-CAN-06] records the initial status in the history (Q-06)', async () => {
    const id = await createApplication(alice, { companyName: 'Innova', jobTitle: 'Data Analyst' });

    const history = await database.db
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, id));
    expect(history).toEqual([expect.objectContaining({ status: 'sent', origin: 'manual' })]);
  });
});

describe('GET /api/applications', () => {
  beforeEach(async () => {
    await createApplication(alice, {
      companyName: 'Zara',
      jobTitle: 'Vendeur',
      status: 'rejected',
      contractType: 'job_etudiant',
    });
    await createApplication(alice, {
      companyName: "McDonald's",
      jobTitle: 'Équipier',
      contractType: 'job_etudiant',
    });
    await createApplication(alice, {
      companyName: 'Axa',
      jobTitle: 'Alternant Data Engineer',
      contractType: 'alternance',
    });
    await createApplication(bob, { companyName: 'Bob Corp', jobTitle: 'Secret', contractType: 'cdi' });
  });

  it('[EF-CAN-01] groups applications by company in alphabetical order', async () => {
    const response = await api(alice).get('/api/applications');

    expect((response.body.items as { company: { name: string } }[]).map((item) => item.company.name)).toEqual(
      ['Axa', "McDonald's", 'Zara'],
    );
  });

  it('[EF-CAN-02] filters by status', async () => {
    const response = await api(alice).get('/api/applications?status=rejected');

    expect(response.body).toMatchObject({ total: 1, items: [{ company: { name: 'Zara' } }] });
  });

  it('[EF-CAN-03] finds an application by a fragment of the company name, ignoring case and accents', async () => {
    const response = await api(alice).get('/api/applications?q=mcdo');

    expect(response.body).toMatchObject({ total: 1, items: [{ company: { name: "McDonald's" } }] });
  });

  it('[EF-CAN-03] finds an application by a fragment of the job title', async () => {
    const response = await api(alice).get('/api/applications?q=EQUIPIER');

    expect(response.body.total).toBe(1);
  });

  it('[EF-CAN-14] filters by contract type', async () => {
    const response = await api(alice).get('/api/applications?contractType=alternance');

    expect(response.body).toMatchObject({ total: 1, items: [{ company: { name: 'Axa' } }] });
  });

  it('[ENF-SEC-04] rejects an unknown filter value with 400', async () => {
    const response = await api(alice).get('/api/applications?status=lost');

    expect(response.status).toBe(400);
  });

  it('[EF-AUT-06] never lists the applications of another user', async () => {
    const response = await api(alice).get('/api/applications?q=secret');

    expect(response.body.total).toBe(0);
  });

  it('[EF-CAN-12] flags a sent application without activity for 11 days (D = 10 by default)', async () => {
    context.clock.advanceDays(11);
    // The 7-day session has expired meanwhile (EF-AUT-07): log in again, as the user would.
    const login = await request(context.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send({ email: 'alice@example.com', password: 'une phrase de passe longue' });

    const response = await api(sessionCookieOf(login)).get('/api/applications?status=sent');

    expect(response.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ jobTitle: 'Équipier', isFollowUpDue: true })]),
    );
  });

  it('[ENF-SEC-04] bounds the page size to 500', async () => {
    const response = await api(alice).get('/api/applications?limit=501');

    expect(response.status).toBe(400);
  });
});

describe('GET/PATCH/DELETE /api/applications/:id', () => {
  let applicationId: number;

  beforeEach(async () => {
    applicationId = await createApplication(alice, { companyName: 'Innova', jobTitle: 'Data Analyst' });
  });

  it('[EF-CAN-07] updates the status (204), records it and counts it as activity', async () => {
    context.clock.advanceDays(3);

    const response = await api(alice).patch(`/api/applications/${applicationId}`, { status: 'interview' });

    expect(response.status).toBe(204);
    const [row] = await database.db.select().from(applications).where(eq(applications.id, applicationId));
    expect(row).toMatchObject({ status: 'interview', lastActivityAt: context.clock.now() });
    const history = await database.db
      .select()
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, applicationId));
    expect(history.map((change) => change.status)).toEqual(['sent', 'interview']);
  });

  it('[EF-CAN-08] sets then clears the note', async () => {
    await api(alice).patch(`/api/applications/${applicationId}`, { notes: 'Relancer par téléphone' });
    const withNote = await api(alice).get(`/api/applications/${applicationId}`);
    await api(alice).patch(`/api/applications/${applicationId}`, { notes: null });
    const withoutNote = await api(alice).get(`/api/applications/${applicationId}`);

    expect(withNote.body.notes).toBe('Relancer par téléphone');
    expect(withoutNote.body.notes).toBeNull();
  });

  it('[ENF-SEC-04] rejects an empty or unknown update with 400', async () => {
    const empty = await api(alice).patch(`/api/applications/${applicationId}`, {});
    const unknown = await api(alice).patch(`/api/applications/${applicationId}`, { companyId: 99 });

    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(400);
  });

  it('[EF-AUT-06] answers 404 for the application of another user, for every method', async () => {
    const responses = await Promise.all([
      api(bob).get(`/api/applications/${applicationId}`),
      api(bob).patch(`/api/applications/${applicationId}`, { status: 'rejected' }),
      api(bob).delete(`/api/applications/${applicationId}`),
      api(bob).get(`/api/applications/${applicationId}/emails`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    const [row] = await database.db.select().from(applications).where(eq(applications.id, applicationId));
    expect(row?.status).toBe('sent');
  });

  it('[ENF-SEC-04] rejects a non-numeric id with 400 and an unknown id with 404', async () => {
    const invalid = await api(alice).get('/api/applications/abc');
    const unknown = await api(alice).get('/api/applications/999999');

    expect(invalid.status).toBe(400);
    expect(unknown.status).toBe(404);
  });

  it('[EF-CAN-09] deletes the application and keeps its messages, detached', async () => {
    const emailId = await insertEmail('alice@example.com', {
      gmailId: 'm1',
      applicationId,
      category: 'acknowledged',
      receivedAt: '2026-09-20T10:00:00Z',
    });

    const response = await api(alice).delete(`/api/applications/${applicationId}`);

    expect(response.status).toBe(204);
    const [email] = await database.db.select().from(emails).where(eq(emails.id, emailId));
    expect(email?.applicationId).toBeNull();
  });

  it('[EF-AUT-05] requires a session', async () => {
    const response = await request(context.app).get(`/api/applications/${applicationId}`);

    expect(response.status).toBe(401);
  });
});

describe('messages of an application', () => {
  let applicationId: number;

  beforeEach(async () => {
    applicationId = await createApplication(alice, { companyName: "McDonald's", jobTitle: 'Équipier' });
  });

  it('[EF-CAN-04] lists the messages in chronological order with a Gmail link (EF-CAN-05)', async () => {
    await insertEmail('alice@example.com', {
      gmailId: 'late',
      applicationId,
      category: 'interview',
      receivedAt: '2026-09-21T10:00:00Z',
    });
    await insertEmail('alice@example.com', {
      gmailId: 'early',
      applicationId,
      category: 'acknowledged',
      receivedAt: '2026-09-19T10:00:00Z',
    });

    const response = await api(alice).get(`/api/applications/${applicationId}/emails`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        subject: 'Objet early',
        category: 'acknowledged',
        receivedAt: '2026-09-19T10:00:00.000Z',
        gmailUrl: 'https://mail.google.com/mail/u/0/#all/thread-early',
      }),
      expect.objectContaining({ subject: 'Objet late', category: 'interview' }),
    ]);
  });

  it('[EF-CAN-10] reattaches a message to another application and applies RG-04 (EF-CAN-11)', async () => {
    const other = await createApplication(alice, { companyName: 'Innova', jobTitle: 'Data Analyst' });
    const emailId = await insertEmail('alice@example.com', {
      gmailId: 'm1',
      applicationId,
      category: 'interview',
      receivedAt: '2026-09-25T10:00:00Z',
    });

    const response = await api(alice).patch(`/api/emails/${emailId}`, { applicationId: other });

    expect(response.status).toBe(204);
    const moved = await api(alice).get(`/api/applications/${other}/emails`);
    expect(moved.body).toHaveLength(1);
    const target = await api(alice).get(`/api/applications/${other}`);
    expect(target.body).toMatchObject({ status: 'interview', lastActivityAt: '2026-09-25T10:00:00.000Z' });
  });

  it('[EF-CAN-11] keeps the Entretien status when a late acknowledgement is attached (RG-04)', async () => {
    await api(alice).patch(`/api/applications/${applicationId}`, { status: 'interview' });
    const emailId = await insertEmail('alice@example.com', {
      gmailId: 'ack',
      applicationId: null,
      category: 'acknowledged',
      receivedAt: '2026-09-23T10:00:00Z',
    });

    await api(alice).patch(`/api/emails/${emailId}`, { applicationId });

    const response = await api(alice).get(`/api/applications/${applicationId}`);
    expect(response.body.status).toBe('interview');
  });

  it('[EF-CAN-10] detaches a message with null', async () => {
    const emailId = await insertEmail('alice@example.com', {
      gmailId: 'm1',
      applicationId,
      category: 'job_alert',
      receivedAt: '2026-09-20T10:00:00Z',
    });

    await api(alice).patch(`/api/emails/${emailId}`, { applicationId: null });

    const response = await api(alice).get(`/api/applications/${applicationId}/emails`);
    expect(response.body).toEqual([]);
  });

  it("[EF-AUT-06] refuses to move a message to another user's application or to touch another user's message", async () => {
    const bobApplication = await createApplication(bob, { companyName: 'Bob Corp', jobTitle: 'Secret' });
    const aliceEmail = await insertEmail('alice@example.com', {
      gmailId: 'm1',
      applicationId,
      category: 'interview',
      receivedAt: '2026-09-20T10:00:00Z',
    });

    const toBobApplication = await api(alice).patch(`/api/emails/${aliceEmail}`, {
      applicationId: bobApplication,
    });
    const byBob = await api(bob).patch(`/api/emails/${aliceEmail}`, { applicationId: bobApplication });

    expect(toBobApplication.status).toBe(404);
    expect(byBob.status).toBe(404);
    const [email] = await database.db.select().from(emails).where(eq(emails.id, aliceEmail));
    expect(email?.applicationId).toBe(applicationId);
  });
});
