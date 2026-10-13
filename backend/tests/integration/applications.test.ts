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
  giveContact,
  logInUser,
  openTestDatabase,
  registerUser,
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
    // Applied on three Paris days: Zara the 1st, McDonald's the 15th at 23:30 in Paris, Axa the 20th.
    await createApplication(alice, {
      companyName: 'Zara',
      jobTitle: 'Vendeur',
      status: 'rejected',
      contractType: 'job_etudiant',
      appliedAt: '2026-09-01T08:00:00.000Z',
    });
    await createApplication(alice, {
      companyName: "McDonald's",
      jobTitle: 'Équipier',
      contractType: 'job_etudiant',
      appliedAt: '2026-09-15T21:30:00.000Z',
    });
    await createApplication(alice, {
      companyName: 'Axa',
      jobTitle: 'Alternant Data Engineer',
      contractType: 'alternance',
      appliedAt: '2026-09-20T08:00:00.000Z',
    });
    await createApplication(bob, { companyName: 'Bob Corp', jobTitle: 'Secret', contractType: 'cdi' });
  });

  const companiesOf = (response: { body: { items: { company: { name: string } }[] } }) =>
    response.body.items.map((item) => item.company.name);

  it('[EF-CAN-20] lists the most recent application first by default', async () => {
    expect(companiesOf(await api(alice).get('/api/applications'))).toEqual(['Axa', "McDonald's", 'Zara']);
    expect(companiesOf(await api(alice).get('/api/applications?sort=applied_at&order=asc'))).toEqual([
      'Zara',
      "McDonald's",
      'Axa',
    ]);
  });

  it('[EF-CAN-01] [EF-CAN-20] groups applications by company in alphabetical order when sorted by company', async () => {
    expect(companiesOf(await api(alice).get('/api/applications?sort=company&order=asc'))).toEqual([
      'Axa',
      "McDonald's",
      'Zara',
    ]);
    expect(companiesOf(await api(alice).get('/api/applications?sort=company&order=desc'))).toEqual([
      'Zara',
      "McDonald's",
      'Axa',
    ]);
  });

  it('[EF-CAN-20] sorts by status, in the order of their rank (RG-04)', async () => {
    expect(companiesOf(await api(alice).get('/api/applications?sort=status&order=desc'))[0]).toBe('Zara');
  });

  it('[EF-CAN-24] filters by application period, whole Paris days, the last one included', async () => {
    // 23:30 in Paris on the 15th is still the 15th, though already the 15th at 21:30 in UTC.
    const period = await api(alice).get('/api/applications?appliedFrom=2026-09-15&appliedTo=2026-09-20');
    expect(companiesOf(period)).toEqual(['Axa', "McDonald's"]);
    expect(period.body).toMatchObject({ total: 2 });

    expect(companiesOf(await api(alice).get('/api/applications?appliedTo=2026-09-15'))).toEqual(["McDonald's", 'Zara']);
    expect(companiesOf(await api(alice).get('/api/applications?appliedFrom=2026-09-16'))).toEqual(['Axa']);
  });

  it('[EF-CAN-24] [ENF-SEC-04] rejects a day that does not exist, or a period that ends before it starts', async () => {
    expect((await api(alice).get('/api/applications?appliedFrom=2026-02-30')).status).toBe(400);
    expect((await api(alice).get('/api/applications?appliedFrom=15/09/2026')).status).toBe(400);
    expect((await api(alice).get('/api/applications?appliedFrom=2026-09-20&appliedTo=2026-09-15')).status).toBe(400);
    expect((await api(alice).get('/api/applications?sort=salary')).status).toBe(400);
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

  const idOf = async (jobTitle: string): Promise<number> => {
    const items = (await api(alice).get('/api/applications')).body.items as { id: number; jobTitle: string }[];
    const found = items.find((item) => item.jobTitle === jobTitle);
    if (!found) throw new Error(`no application ${jobTitle}`);
    return found.id;
  };

  it('[EF-CAN-12] flags a sent application without activity for 11 days (D = 10 by default)', async () => {
    const userId = await userIdOf('alice@example.com');
    await giveContact(database, { userId, applicationId: await idOf('Équipier'), address: 'rh@mcdonalds.example' });
    context.clock.advanceDays(11);
    // The 24-hour session has expired meanwhile (EF-AUT-07): log in again, as the user would.
    const cookie = await logInUser(context.app, 'alice@example.com');

    const response = await api(cookie).get('/api/applications?status=sent');

    expect(response.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ jobTitle: 'Équipier', isFollowUpDue: true })]),
    );
  });

  it('[RG-06] [BES-34] never flags an application nobody can be written to', async () => {
    context.clock.advanceDays(11);
    const cookie = await logInUser(context.app, 'alice@example.com');

    const response = await api(cookie).get('/api/applications?status=sent');

    // Axa and McDonald's are both sent and silent for 11 days; neither holds an address to write to.
    expect((response.body.items as { isFollowUpDue: boolean }[]).every((item) => !item.isFollowUpDue)).toBe(true);
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
    alice = await logInUser(context.app, 'alice@example.com'); // EF-AUT-07: the session lasts 24 hours

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

describe('offer description and application date (T-104)', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DESCRIPTION = 'Pipelines de données sous Airflow, Python et SQL ; équipe data de 6 personnes.';
  const daysAgo = (days: number) => new Date(context.clock.now().getTime() - days * DAY_MS).toISOString();

  interface Detail {
    appliedAt: string;
    lastActivityAt: string;
    isFollowUpDue: boolean;
    offerDescription: string | null;
  }

  const detailOf = async (id: number): Promise<Detail> => {
    const response = await api(alice).get(`/api/applications/${id}`);
    expect(response.status).toBe(200);
    return response.body as Detail;
  };

  it('[EF-CAN-15] stores the offer description, returns it in the detail and never in the list', async () => {
    const id = await createApplication(alice, {
      companyName: 'Arkema',
      jobTitle: 'Data Engineer',
      offerDescription: DESCRIPTION,
    });

    expect((await detailOf(id)).offerDescription).toBe(DESCRIPTION);
    const list = await api(alice).get('/api/applications');
    expect((list.body as { items: object[] }).items[0]).not.toHaveProperty('offerDescription');
  });

  it('[EF-CAN-15] changes then clears the offer description', async () => {
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer' });
    expect((await detailOf(id)).offerDescription).toBeNull();

    expect((await api(alice).patch(`/api/applications/${id}`, { offerDescription: DESCRIPTION })).status).toBe(204);
    expect((await detailOf(id)).offerDescription).toBe(DESCRIPTION);

    expect((await api(alice).patch(`/api/applications/${id}`, { offerDescription: null })).status).toBe(204);
    expect((await detailOf(id)).offerDescription).toBeNull();
  });

  it('[EF-CAN-15] accepts 20 000 characters and refuses 20 001', async () => {
    const created = await api(alice).post('/api/applications', {
      companyName: 'Arkema',
      jobTitle: 'Data Engineer',
      status: 'sent',
      offerDescription: 'a'.repeat(20_001),
    });
    expect(created.status).toBe(400);

    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer' });
    expect((await api(alice).patch(`/api/applications/${id}`, { offerDescription: 'a'.repeat(20_001) })).status).toBe(400);
    expect((await api(alice).patch(`/api/applications/${id}`, { offerDescription: 'a'.repeat(20_000) })).status).toBe(204);
  });

  it('[EF-CAN-16] [RG-16] dates a new application in the past and follows it up from that date', async () => {
    const appliedAt = daysAgo(15);
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer', appliedAt });
    await giveContact(database, { userId: await userIdOf('alice@example.com'), applicationId: id, address: 'rh@arkema.example' });

    const detail = await detailOf(id);
    expect(detail.appliedAt).toBe(appliedAt);
    expect(detail.lastActivityAt).toBe(appliedAt);
    expect(detail.isFollowUpDue).toBe(true);
    const history = await database.db
      .select({ changedAt: applicationStatusHistory.changedAt })
      .from(applicationStatusHistory)
      .where(eq(applicationStatusHistory.applicationId, id));
    expect(history.map((row) => row.changedAt.toISOString())).toEqual([appliedAt]);
  });

  it('[EF-CAN-16] dates the application at the time of creation when no date is given', async () => {
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer' });

    expect((await detailOf(id)).appliedAt).toBe(context.clock.now().toISOString());
  });

  it('[EF-CAN-16] refuses a date in the future or before 2000, on creation and on change', async () => {
    const base = { companyName: 'Arkema', jobTitle: 'Data Engineer', status: 'sent' };
    const tomorrow = daysAgo(-1);

    const future = await api(alice).post('/api/applications', { ...base, appliedAt: tomorrow });
    expect(future.status).toBe(400);
    expect((future.body as { details: { path: string }[] }).details.map((issue) => issue.path)).toEqual([
      'body.appliedAt',
    ]);
    expect((await api(alice).post('/api/applications', { ...base, appliedAt: '1999-12-31T23:59:59.000Z' })).status).toBe(400);

    const id = await createApplication(alice, base);
    expect((await api(alice).patch(`/api/applications/${id}`, { appliedAt: tomorrow })).status).toBe(400);
    expect((await api(alice).patch(`/api/applications/${id}`, { appliedAt: 'hier' })).status).toBe(400);
  });

  it('[RG-16] moves the last activity with the date while nothing else happened', async () => {
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer' });
    await giveContact(database, { userId: await userIdOf('alice@example.com'), applicationId: id, address: 'rh@arkema.example' });
    const appliedAt = daysAgo(20);

    expect((await api(alice).patch(`/api/applications/${id}`, { appliedAt })).status).toBe(204);

    const detail = await detailOf(id);
    expect(detail.appliedAt).toBe(appliedAt);
    expect(detail.lastActivityAt).toBe(appliedAt);
    expect(detail.isFollowUpDue).toBe(true);
  });

  it('[RG-16] keeps a more recent activity when the date changes', async () => {
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer', appliedAt: daysAgo(20) });
    await api(alice).patch(`/api/applications/${id}`, { status: 'acknowledged' });
    const activity = context.clock.now().toISOString();

    expect((await api(alice).patch(`/api/applications/${id}`, { appliedAt: daysAgo(25) })).status).toBe(204);

    const detail = await detailOf(id);
    expect(detail.appliedAt).toBe(daysAgo(25));
    expect(detail.lastActivityAt).toBe(activity);
  });

  it("[EF-AUT-06] never returns another user's application detail", async () => {
    const id = await createApplication(alice, { companyName: 'Arkema', jobTitle: 'Data Engineer', offerDescription: DESCRIPTION });

    expect((await api(bob).get(`/api/applications/${id}`)).status).toBe(404);
    expect((await api(bob).patch(`/api/applications/${id}`, { offerDescription: 'x' })).status).toBe(404);
  });
});
