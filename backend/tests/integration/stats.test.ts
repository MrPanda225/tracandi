import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applications,
  appSettings,
  companies,
  jobOffers,
  platforms,
  users,
  watchedSites,
} from '../../src/db/schema.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
const NOW = new Date('2026-09-22T08:00:00.000Z');
let context: TestContext;
let alice: string;
let bob: string;

const api = (cookie: string) => ({
  get: (path: string) => request(context.app).get(path).set('Cookie', cookie),
  post: (path: string, body: object) =>
    request(context.app).post(path).set('Cookie', cookie).set('Content-Type', 'application/json').send(body),
  patch: (path: string, body: object) =>
    request(context.app).patch(path).set('Cookie', cookie).set('Content-Type', 'application/json').send(body),
});

interface DashboardBody {
  totals: { applications: number; reachedInterview: number; responseRate: number };
  byStatus: { status: string; count: number }[];
  byChannel: { direct: number; platform: number };
  byContractType: { contractType: string; count: number; responseRate: number }[];
  weekly: { weekStart: string; sent: number; interviews: number; rejected: number }[];
  followUps: { total: number; items: { company: string; jobTitle: string; daysSinceActivity: number }[] };
  offers: { newAboveThreshold: number; threshold: number };
  followUpDays: number;
}

const dashboardOf = async (cookie: string): Promise<DashboardBody> => {
  const response = await api(cookie).get('/api/stats/dashboard');
  expect(response.status).toBe(200);
  return response.body as DashboardBody;
};

/** Creates an application at the given instant (the API dates it with the clock). */
const createAt = async (instant: string, body: Record<string, unknown>): Promise<number> => {
  context.clock.set(new Date(instant));
  const response = await api(alice).post('/api/applications', { status: 'sent', ...body });
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`);
  return (response.body as { id: number }).id;
};

const changeStatusAt = async (instant: string, id: number, status: string): Promise<void> => {
  context.clock.set(new Date(instant));
  const response = await api(alice).patch(`/api/applications/${id}`, { status });
  if (response.status !== 204) throw new Error(`update failed: ${response.status}`);
};

const userIdOf = async (email: string): Promise<number> => {
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error('unknown user');
  return user.id;
};

/**
 * Alice's history: three applications sent on 1 September (one through a platform), one still « À postuler »,
 * Nova → Entretien on 16/09 then Refusée on 18/09, Lumen → Proposition on 17/09; Ardent is left without answer.
 */
const seedAliceHistory = async (): Promise<void> => {
  const nova = await createAt('2026-09-01T09:00:00.000Z', {
    companyName: 'Atelier Nova',
    jobTitle: 'Développeur',
    contractType: 'cdi',
  });
  const lumen = await createAt('2026-09-01T10:00:00.000Z', {
    companyName: 'Maison Lumen',
    jobTitle: 'Data analyst',
    contractType: 'alternance',
  });
  await createAt('2026-09-01T11:00:00.000Z', {
    companyName: 'Studio Ardent',
    jobTitle: 'UX',
    contractType: 'cdi',
  });
  await createAt('2026-09-15T09:00:00.000Z', {
    companyName: 'Orbe',
    jobTitle: 'Assistant',
    status: 'to_apply',
    contractType: 'cdd',
  });
  await changeStatusAt('2026-09-16T14:00:00.000Z', nova, 'interview');
  await changeStatusAt('2026-09-17T14:00:00.000Z', lumen, 'offer');
  await changeStatusAt('2026-09-18T14:00:00.000Z', nova, 'rejected');
  const [platform] = await database.db
    .insert(platforms)
    .values({ name: 'APEC', nameKey: 'apec' })
    .returning({ id: platforms.id });
  await database.db.update(applications).set({ platformId: platform?.id }).where(eq(applications.id, lumen));
  context.clock.set(NOW);
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

describe('GET /api/stats/dashboard', () => {
  it('[EF-TDB-01] [EF-TDB-03] returns zeros for an account without application', async () => {
    const dashboard = await dashboardOf(alice);

    expect(dashboard.totals).toEqual({ applications: 0, reachedInterview: 0, responseRate: 0 });
    expect(dashboard.byStatus.every((entry) => entry.count === 0)).toBe(true);
    expect(dashboard.weekly).toHaveLength(16);
    expect(dashboard.followUps).toEqual({ total: 0, items: [] });
    expect(dashboard.offers).toEqual({ newAboveThreshold: 0, threshold: 60 });
    expect(dashboard.followUpDays).toBe(10);
  });

  it('[EF-TDB-01] [EF-TDB-02] [EF-TDB-03] counts the applications, those that reached an interview and the RG-07 rate', async () => {
    await seedAliceHistory();

    const { totals } = await dashboardOf(alice);

    // Nova reached Entretien before being refused (history, Q-06); Lumen is at Proposition.
    expect(totals).toEqual({ applications: 4, reachedInterview: 2, responseRate: 50 });
  });

  it('[EF-TDB-05] counts the applications of every status, in RG-01 order', async () => {
    await seedAliceHistory();

    const { byStatus } = await dashboardOf(alice);

    expect(byStatus).toEqual([
      { status: 'to_apply', count: 1 },
      { status: 'sent', count: 1 },
      { status: 'acknowledged', count: 0 },
      { status: 'interview', count: 0 },
      { status: 'offer', count: 1 },
      { status: 'rejected', count: 1 },
    ]);
  });

  it('[EF-TDB-06] splits the applications between direct and platform', async () => {
    await seedAliceHistory();

    expect((await dashboardOf(alice)).byChannel).toEqual({ direct: 3, platform: 1 });
  });

  it('[EF-TDB-09] gives the count and the RG-07 rate of every contract type', async () => {
    await seedAliceHistory();

    const { byContractType } = await dashboardOf(alice);

    expect(byContractType).toEqual([
      { contractType: 'cdi', count: 2, responseRate: 50 },
      { contractType: 'cdd', count: 1, responseRate: 0 },
      { contractType: 'alternance', count: 1, responseRate: 100 },
      { contractType: 'job_etudiant', count: 0, responseRate: 0 },
      { contractType: 'autre', count: 0, responseRate: 0 },
      { contractType: 'non_precise', count: 0, responseRate: 0 },
    ]);
  });

  it('[EF-TDB-04] counts sent, interviews and refusals for each of the last 16 weeks (UTC, Monday first)', async () => {
    await seedAliceHistory();

    const { weekly } = await dashboardOf(alice);

    expect(weekly).toHaveLength(16);
    expect(weekly[0]?.weekStart).toBe('2026-06-08T00:00:00.000Z');
    expect(weekly.find((week) => week.weekStart === '2026-08-31T00:00:00.000Z')).toEqual({
      weekStart: '2026-08-31T00:00:00.000Z',
      sent: 3,
      interviews: 0,
      rejected: 0,
    });
    // « À postuler » is not counted as sent.
    expect(weekly.find((week) => week.weekStart === '2026-09-14T00:00:00.000Z')).toEqual({
      weekStart: '2026-09-14T00:00:00.000Z',
      sent: 0,
      interviews: 1,
      rejected: 1,
    });
    expect(weekly.at(-1)).toEqual({
      weekStart: '2026-09-21T00:00:00.000Z',
      sent: 0,
      interviews: 0,
      rejected: 0,
    });
  });

  it('[EF-TDB-07] lists the applications to follow up, oldest activity first', async () => {
    await createAt('2026-09-05T09:00:00.000Z', { companyName: 'Récent', jobTitle: 'Poste B' });
    await createAt('2026-09-02T09:00:00.000Z', { companyName: 'Ancien', jobTitle: 'Poste A' });
    await createAt('2026-09-20T09:00:00.000Z', { companyName: 'Frais', jobTitle: 'Poste C' });
    context.clock.set(NOW);

    const { followUps } = await dashboardOf(alice);

    expect(followUps.total).toBe(2);
    expect(followUps.items).toMatchObject([
      { company: 'Ancien', jobTitle: 'Poste A', daysSinceActivity: 19 },
      { company: 'Récent', jobTitle: 'Poste B', daysSinceActivity: 16 },
    ]);
  });

  it('[RG-06] uses the follow-up delay D of the user', async () => {
    await createAt('2026-09-05T09:00:00.000Z', { companyName: 'Récent', jobTitle: 'Poste B' });
    context.clock.set(NOW);
    await database.db
      .update(appSettings)
      .set({ followUpDays: 30 })
      .where(eq(appSettings.userId, await userIdOf('alice@example.com')));

    const dashboard = await dashboardOf(alice);

    expect(dashboard.followUpDays).toBe(30);
    expect(dashboard.followUps.total).toBe(0);
  });

  it('[EF-TDB-08] counts the new offers whose score reaches the threshold S', async () => {
    const [company] = await database.db
      .insert(companies)
      .values({ userId: await userIdOf('alice@example.com'), name: 'Atelier Nova', nameKey: 'atelier nova' })
      .returning({ id: companies.id });
    const [site] = await database.db
      .insert(watchedSites)
      .values({ companyId: company?.id ?? 0, adapter: 'greenhouse', identifier: 'ateliernova' })
      .returning({ id: watchedSites.id });
    const offer = (externalId: string, relevanceScore: number, status: 'new' | 'dismissed') => ({
      siteId: site?.id ?? 0,
      externalId,
      title: `Offre ${externalId}`,
      url: `https://example.com/${externalId}`,
      relevanceScore,
      status,
    });
    await database.db
      .insert(jobOffers)
      .values([
        offer('a', 80, 'new'),
        offer('b', 60, 'new'),
        offer('c', 59, 'new'),
        offer('d', 95, 'dismissed'),
      ]);

    expect((await dashboardOf(alice)).offers).toEqual({ newAboveThreshold: 2, threshold: 60 });
    expect((await dashboardOf(bob)).offers.newAboveThreshold).toBe(0);
  });

  it("[EF-AUT-06] never counts another user's applications", async () => {
    await seedAliceHistory();

    const dashboard = await dashboardOf(bob);

    expect(dashboard.totals.applications).toBe(0);
    expect(dashboard.weekly.every((week) => week.sent === 0 && week.interviews === 0)).toBe(true);
  });

  it('[EF-AUT-05] refuses a request without session with 401', async () => {
    expect((await request(context.app).get('/api/stats/dashboard')).status).toBe(401);
  });
});
