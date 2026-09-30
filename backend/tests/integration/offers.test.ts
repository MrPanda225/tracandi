import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applications, companies, jobOffers, users, watchedSites } from '../../src/db/schema.js';
import {
  createTestContext,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;

const api = (cookie: string) => ({
  list: (query: Record<string, string> = {}) =>
    request(context.app).get('/api/offers').query(query).set('Cookie', cookie),
  get: (id: number) =>
    request(context.app)
      .get(`/api/offers/${String(id)}`)
      .set('Cookie', cookie),
  update: (id: number, body: unknown) =>
    request(context.app)
      .patch(`/api/offers/${String(id)}`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  apply: (id: number) =>
    request(context.app)
      .post(`/api/offers/${String(id)}/apply`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json'),
});

type OfferSeed = Partial<typeof jobOffers.$inferInsert> & { title: string };

/** A fictitious source of alice, and the offers it produced, as a pass of the watch would leave them. */
const seedOffers = async (offers: readonly OfferSeed[]): Promise<number[]> => {
  const [user] = await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'alice@example.com'));
  const [company] = await database.db
    .insert(companies)
    .values({ userId: user?.id ?? 0, name: 'Atelier Aurore', nameKey: 'atelier aurore' })
    .returning({ id: companies.id });
  const [site] = await database.db
    .insert(watchedSites)
    .values({
      userId: user?.id ?? 0,
      companyId: company?.id ?? 0,
      adapter: 'greenhouse',
      identifier: 'atelieraurore',
    })
    .returning({ id: watchedSites.id });
  const rows = await database.db
    .insert(jobOffers)
    .values(
      offers.map((offer, index) => ({
        siteId: site?.id ?? 0,
        externalId: `offer-${String(index)}`,
        url: `https://boards.greenhouse.io/atelieraurore/jobs/${String(index)}`,
        firstSeenAt: new Date(Date.UTC(2026, 8, 20, 8, index)),
        ...offer,
      })),
    )
    .returning({ id: jobOffers.id });
  return rows.map((row) => row.id);
};

const titlesOf = (response: request.Response): string[] =>
  (response.body as { items: { title: string }[] }).items.map((item) => item.title);

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('offers of the watch (EF-VEI-16 to EF-VEI-22)', () => {
  it('[EF-VEI-16] lists the offers best score first, those not scored last', async () => {
    await seedOffers([
      { title: 'Data analyst', relevanceScore: 70 },
      { title: 'Non notée', relevanceScore: null },
      { title: 'Data engineer', relevanceScore: 92, relevanceReason: 'Poste data proche.' },
    ]);

    const listed = await api(alice).list();

    expect(listed.status).toBe(200);
    expect(titlesOf(listed)).toEqual(['Data engineer', 'Data analyst', 'Non notée']);
    expect(listed.body).toMatchObject({ total: 3 });
    expect((listed.body as { items: unknown[] }).items[0]).toMatchObject({
      companyName: 'Atelier Aurore',
      relevanceReason: 'Poste data proche.',
      source: { adapter: 'greenhouse', label: 'Greenhouse' },
      status: 'new',
      applicationId: null,
    });
    // The text of an offer is read in its detail only.
    expect((listed.body as { items: Record<string, unknown>[] }).items[0]).not.toHaveProperty('description');
  });

  it('[EF-VEI-17] keeps the offers from a minimum score', async () => {
    await seedOffers([
      { title: 'Haute', relevanceScore: 80 },
      { title: 'Basse', relevanceScore: 30 },
    ]);

    expect(titlesOf(await api(alice).list({ minScore: '60' }))).toEqual(['Haute']);
  });

  it('[EF-VEI-22] keeps the offers of one contract type', async () => {
    await seedOffers([
      { title: 'En CDI', contractType: 'cdi', relevanceScore: 50 },
      { title: 'En alternance', contractType: 'alternance', relevanceScore: 60 },
    ]);

    expect(titlesOf(await api(alice).list({ contractType: 'alternance' }))).toEqual(['En alternance']);
  });

  it('[EF-VEI-18] keeps an offer in view, and moves a dismissed one out of it', async () => {
    const [kept = 0, dismissed = 0] = await seedOffers([
      { title: 'Gardée', relevanceScore: 60 },
      { title: 'Écartée', relevanceScore: 70 },
    ]);

    expect((await api(alice).update(kept, { status: 'saved' })).body).toMatchObject({ status: 'saved' });
    expect((await api(alice).update(dismissed, { status: 'dismissed' })).body).toMatchObject({
      status: 'dismissed',
    });

    expect(titlesOf(await api(alice).list())).toEqual(['Gardée']);
    expect(titlesOf(await api(alice).list({ view: 'saved' }))).toEqual(['Gardée']);
    expect(titlesOf(await api(alice).list({ view: 'dismissed' }))).toEqual(['Écartée']);
  });

  it('[EF-VEI-19] [EF-VEI-20] creates an application « Envoyée » from the offer applied to', async () => {
    const [id = 0] = await seedOffers([
      { title: 'Data analyst', contractType: 'alternance', relevanceScore: 80 },
    ]);

    const applied = await api(alice).apply(id);

    expect(applied.status).toBe(201);
    const { applicationId } = applied.body as { applicationId: number };
    expect(applied.body).toMatchObject({ offer: { status: 'applied', applicationId } });
    const [application] = await database.db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(application).toMatchObject({
      jobTitle: 'Data analyst',
      contractType: 'alternance',
      status: 'sent',
      source: 'offer',
      offerId: id,
    });
    expect(titlesOf(await api(alice).list({ view: 'applied' }))).toEqual(['Data analyst']);
  });

  it('[EF-VEI-19] refuses to apply twice, or to set aside an offer applied to', async () => {
    const [id = 0] = await seedOffers([{ title: 'Data analyst', relevanceScore: 80 }]);
    await api(alice).apply(id).expect(201);

    expect((await api(alice).apply(id)).status).toBe(409);
    expect((await api(alice).update(id, { status: 'dismissed' })).status).toBe(409);
    expect(await database.db.select().from(applications)).toHaveLength(1);
  });

  it('[EF-VEI-20] refuses an offer whose company already has this job title, and leaves the offer as it was', async () => {
    const [id = 0] = await seedOffers([{ title: 'Data analyst', relevanceScore: 80 }]);
    await request(context.app)
      .post('/api/applications')
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({ companyName: 'Atelier Aurore', jobTitle: 'Data analyst', status: 'sent' })
      .expect(201);

    expect((await api(alice).apply(id)).status).toBe(409);
    expect((await api(alice).get(id)).body).toMatchObject({ status: 'new', applicationId: null });
  });

  it('[EF-VEI-16] gives the text of an offer in its detail', async () => {
    const [id = 0] = await seedOffers([{ title: 'Data analyst', description: 'SQL et tableaux de bord.' }]);

    expect((await api(alice).get(id)).body).toMatchObject({
      title: 'Data analyst',
      description: 'SQL et tableaux de bord.',
    });
  });

  it.each([
    ['a score above 100', { minScore: '101' }],
    ['an unknown view', { view: 'all' }],
    ['an unknown contract', { contractType: 'stage' }],
  ])('[ENF-SEC-04] refuses %s', async (_case, query) => {
    expect((await api(alice).list(query)).status).toBe(400);
  });

  it('[ENF-SEC-04] refuses to set an offer « postulée » by hand', async () => {
    const [id = 0] = await seedOffers([{ title: 'Data analyst' }]);

    expect((await api(alice).update(id, { status: 'applied' })).status).toBe(400);
  });

  it('[EF-AUT-06] never shows nor touches the offers of another account', async () => {
    const [id = 0] = await seedOffers([{ title: 'Data analyst' }]);
    const bob = await registerUser(context.app, 'bob@example.com');

    expect((await api(bob).list()).body).toEqual({ items: [], total: 0 });
    expect((await api(bob).get(id)).status).toBe(404);
    expect((await api(bob).update(id, { status: 'dismissed' })).status).toBe(404);
    expect((await api(bob).apply(id)).status).toBe(404);
  });
});
