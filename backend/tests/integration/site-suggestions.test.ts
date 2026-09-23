import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applications,
  companies,
  emails,
  platformDomains,
  platforms,
  processedMessages,
  users,
} from '../../src/db/schema.js';
import { normalizeKey } from '../../src/lib/text.js';
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
let aliceId: number;

const RECEIVED_AT = new Date('2026-09-20T09:00:00.000Z');

/** Une entreprise du candidat, avec une candidature et les messages qu'elle lui a envoyés. */
const givenApplication = async (companyName: string, senders: readonly string[]): Promise<number> => {
  const [company] = await database.db
    .insert(companies)
    .values({ userId: aliceId, name: companyName, nameKey: normalizeKey(companyName) })
    .returning({ id: companies.id });
  const companyId = company?.id ?? 0;
  const [application] = await database.db
    .insert(applications)
    .values({
      companyId,
      jobTitle: 'Data Analyst',
      jobTitleKey: 'data analyst',
      status: 'sent',
      source: 'manual',
      appliedAt: RECEIVED_AT,
      lastActivityAt: RECEIVED_AT,
    })
    .returning({ id: applications.id });

  for (const [index, from] of senders.entries()) {
    const gmailMessageId = `${normalizeKey(companyName).replaceAll(' ', '')}-${String(index)}`;
    await database.db
      .insert(processedMessages)
      .values({ userId: aliceId, gmailMessageId, outcome: 'retained' });
    await database.db.insert(emails).values({
      userId: aliceId,
      gmailMessageId,
      gmailThreadId: gmailMessageId,
      applicationId: application?.id ?? 0,
      direction: 'inbound',
      fromAddress: from,
      subject: 'Votre candidature',
      snippet: 'Nous avons bien reçu votre candidature.',
      category: 'acknowledged',
      receivedAt: RECEIVED_AT,
    });
  }
  return companyId;
};

const api = (cookie: string) => ({
  suggestions: () => request(context.app).get('/api/sites/suggestions').set('Cookie', cookie),
  dismiss: (companyId: number) =>
    request(context.app)
      .post(`/api/sites/suggestions/${String(companyId)}/dismiss`)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json'),
  addSource: (body: unknown) =>
    request(context.app)
      .post('/api/sites')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
});

const itemsOf = async (cookie: string) =>
  ((await api(cookie).suggestions()).body as { items: Record<string, unknown>[] }).items;

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
  const [user] = await database.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'alice@example.com'));
  aliceId = user?.id ?? 0;
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('sources déduites des candidatures (EF-VEI-23 à EF-VEI-25)', () => {
  it('[EF-VEI-23] [RG-19] proposes a company the candidate applied to, with the domain it wrote from', async () => {
    await givenApplication('Arkema', ['recrutement@arkema.com', 'rh@arkema.com']);

    const items = await itemsOf(alice);

    expect(items).toEqual([
      expect.objectContaining({
        companyName: 'Arkema',
        domain: 'arkema.com',
        adapter: 'generic',
        identifier: 'https://arkema.com',
        messages: 2,
      }),
    ]);
  });

  it('[RG-19] drops a platform and a mailbox provider, which say nothing of the company', async () => {
    const [platform] = await database.db
      .insert(platforms)
      .values({ name: 'APEC', nameKey: 'apec' })
      .returning({ id: platforms.id });
    await database.db.insert(platformDomains).values({ platformId: platform?.id ?? 0, domain: 'apec.fr' });
    await givenApplication('Maison Lumen', ['no-reply@apec.fr', 'sophie@gmail.com']);

    await expect(itemsOf(alice)).resolves.toEqual([]);
  });

  it('[RG-19] keeps the company domain even when a platform wrote more often', async () => {
    const [platform] = await database.db
      .insert(platforms)
      .values({ name: 'APEC', nameKey: 'apec' })
      .returning({ id: platforms.id });
    await database.db.insert(platformDomains).values({ platformId: platform?.id ?? 0, domain: 'apec.fr' });
    await givenApplication('Nova', ['a@apec.fr', 'b@apec.fr', 'c@apec.fr', 'rh@nova.fr']);

    expect(await itemsOf(alice)).toEqual([
      expect.objectContaining({ companyName: 'Nova', domain: 'nova.fr', messages: 1 }),
    ]);
  });

  it('[EF-VEI-24] proposes the ATS the sender designates, with the slug of the company', async () => {
    await givenApplication('Atelier Aurore', ['no-reply@eu.greenhouse.io', 'rh@atelier-aurore.fr']);

    expect(await itemsOf(alice)).toEqual([
      expect.objectContaining({
        adapter: 'greenhouse',
        // RG-08 : un slug pour un job board, pas une adresse.
        identifier: 'atelieraurore',
        domain: 'atelier-aurore.fr',
      }),
    ]);
  });

  it('[EF-VEI-23] proposes nothing for a company already watched', async () => {
    const companyId = await givenApplication('Arkema', ['recrutement@arkema.com']);
    await api(alice)
      .addSource({ companyName: 'Arkema', adapter: 'generic', identifier: 'https://arkema.com/carrieres' })
      .expect(201);

    expect(await itemsOf(alice)).toEqual([]);
    expect(companyId).toBeGreaterThan(0);
  });

  it('[EF-VEI-25] drops a suggestion the candidate set aside, for good', async () => {
    const companyId = await givenApplication('Arkema', ['recrutement@arkema.com']);

    expect((await api(alice).dismiss(companyId)).status).toBe(204);

    expect(await itemsOf(alice)).toEqual([]);
    // Deux refus de suite ne sont pas une erreur.
    expect((await api(alice).dismiss(companyId)).status).toBe(204);
  });

  it('[EF-VEI-23] orders the proposals by how much the company wrote', async () => {
    await givenApplication('Petite', ['rh@petite.fr']);
    await givenApplication('Grande', ['a@grande.fr', 'b@grande.fr', 'c@grande.fr']);

    expect((await itemsOf(alice)).map((item) => item['companyName'])).toEqual(['Grande', 'Petite']);
  });

  it('[EF-AUT-06] never proposes, nor lets set aside, the company of another account', async () => {
    const bob = await registerUser(context.app, 'bob@example.com');
    const companyId = await givenApplication('Arkema', ['recrutement@arkema.com']);

    expect(await itemsOf(bob)).toEqual([]);
    expect((await api(bob).dismiss(companyId)).status).toBe(404);
    expect(await itemsOf(alice)).toHaveLength(1);
  });

  it('[EF-AUT-05] refuses both routes without a session', async () => {
    expect((await request(context.app).get('/api/sites/suggestions')).status).toBe(401);
    expect(
      (
        await request(context.app)
          .post('/api/sites/suggestions/1/dismiss')
          .set('Content-Type', 'application/json')
      ).status,
    ).toBe(401);
  });
});
