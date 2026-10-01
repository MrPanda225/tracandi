import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applications,
  companies,
  emails,
  processedMessages,
  users,
  watchedSites,
} from '../../src/db/schema.js';
import { normalizeKey } from '../../src/lib/text.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
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

/** A company of the candidate, with one application and a message received from its domain (RG-19). */
const givenApplication = async (companyName: string, domain: string): Promise<void> => {
  const key = normalizeKey(companyName);
  const [company] = await database.db
    .insert(companies)
    .values({ userId: aliceId, name: companyName, nameKey: key })
    .returning({ id: companies.id });
  const [application] = await database.db
    .insert(applications)
    .values({
      companyId: company?.id ?? 0,
      jobTitle: 'Data Analyst',
      jobTitleKey: 'data analyst',
      status: 'sent',
      source: 'manual',
      appliedAt: RECEIVED_AT,
      lastActivityAt: RECEIVED_AT,
    })
    .returning({ id: applications.id });
  const gmailMessageId = `msg-${key.replaceAll(' ', '')}`;
  await database.db
    .insert(processedMessages)
    .values({ userId: aliceId, gmailMessageId, outcome: 'retained' });
  await database.db.insert(emails).values({
    userId: aliceId,
    gmailMessageId,
    gmailThreadId: gmailMessageId,
    applicationId: application?.id ?? 0,
    direction: 'inbound',
    fromAddress: `rh@${domain}`,
    subject: 'Votre candidature',
    snippet: 'Nous avons bien reçu votre candidature.',
    category: 'acknowledged',
    receivedAt: RECEIVED_AT,
  });
};

const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

/** Fictitious sites: no request ever leaves the test (testing.md). */
const SITES: Record<string, { status?: number; body: string }> = {
  'https://aurore.example/': { body: html('<a href="https://jobs.ashbyhq.com/Aurore">Nous rejoindre</a>') },
  'https://api.ashbyhq.com/posting-api/job-board/Aurore': {
    body: JSON.stringify({
      jobs: [
        { id: 'a1', title: 'Data analyst', jobUrl: 'https://jobs.ashbyhq.com/Aurore/a1', isListed: true },
        { id: 'a2', title: 'Data engineer', jobUrl: 'https://jobs.ashbyhq.com/Aurore/a2', isListed: true },
      ],
    }),
  },
  'https://nova.example/': {
    body: html('<nav><a href="https://nova.example/carrieres">Carrières</a></nav>'),
  },
  'https://nova.example/carrieres': { body: html('<h1>Rejoignez-nous</h1><p>Aucune offre balisée.</p>') },
};

const collector: AdapterDeps['fetch'] = (url) => {
  const site = SITES[url];
  return site
    ? Promise.resolve({ url, status: site.status ?? 200, contentType: 'text/html', body: site.body })
    : Promise.reject(new Error(`getaddrinfo ENOTFOUND ${new URL(url).hostname}`));
};

const discover = async () => {
  const accepted = await request(context.app)
    .post('/api/sites/suggestions/discover')
    .set('Cookie', alice)
    .set('Content-Type', 'application/json');
  await context.queue.drain();
  return accepted;
};

const suggestionOf = async (companyName: string) =>
  (
    (await request(context.app).get('/api/sites/suggestions').set('Cookie', alice)).body as {
      items: { companyName: string }[];
    }
  ).items.find((item) => item.companyName === companyName);

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database, { collect: collector });
  alice = await registerUser(context.app, 'alice@example.com');
  const [user] = await database.db.select({ id: users.id }).from(users).limit(1);
  aliceId = user?.id ?? 0;
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('search of the career pages (EF-VEI-38 to EF-VEI-40)', () => {
  it('[EF-VEI-38] [EF-VEI-39] [EF-VEI-40] finds the Ashby board a home page links to, and verifies it', async () => {
    await givenApplication('Atelier Aurore', 'aurore.example');

    const accepted = await discover();

    expect(accepted.status).toBe(202);
    const runId = (accepted.body as { runId: number }).runId;
    expect(await context.queue.stateOf(aliceId, runId)).toMatchObject({
      outcome: 'success',
      counters: { companies_searched: 1, sources_verified: 1 },
    });
    expect(await suggestionOf('Atelier Aurore')).toMatchObject({
      adapter: 'ashby',
      identifier: 'Aurore',
      verification: 'verified',
      offerCount: 2,
    });
  });

  it('[EF-VEI-38] [EF-VEI-39] proposes the career page a home page links to, to confirm when it shows no tagged offer', async () => {
    await givenApplication('Nova Services', 'nova.example');

    await discover();

    expect(await suggestionOf('Nova Services')).toMatchObject({
      adapter: 'generic',
      identifier: 'https://nova.example/carrieres',
      verification: 'unconfirmed',
      offerCount: null,
    });
  });

  it('[EF-VEI-39] says nothing was found when the site cannot be reached, and keeps the guess', async () => {
    await givenApplication('Introuvable', 'introuvable.example');

    await discover();

    expect(await suggestionOf('Introuvable')).toMatchObject({
      adapter: 'generic',
      identifier: 'https://introuvable.example',
      verification: 'not_found',
    });
  });

  it('[EF-VEI-40] [RG-19] adds no source to the watch', async () => {
    await givenApplication('Atelier Aurore', 'aurore.example');

    await discover();

    expect(await database.db.select().from(watchedSites)).toHaveLength(0);
  });

  it('[EF-VEI-23] shows a proposal never searched as before', async () => {
    await givenApplication('Atelier Aurore', 'aurore.example');

    expect(await suggestionOf('Atelier Aurore')).toMatchObject({ verification: null, discoveredAt: null });
  });
});
