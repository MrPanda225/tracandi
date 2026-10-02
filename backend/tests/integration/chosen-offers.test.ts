import request from 'supertest';
import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { chosenOffers, jobRuns, llmCalls, users } from '../../src/db/schema.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  tablesHolding,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;
let bob: string;

/** What the models were asked, and by which provider; the extraction and the scoring share them. */
const calls: { provider: ProviderName; task: 'extraction' | 'scoring'; system: string; prompt: string }[] =
  [];
const answers: Record<'local' | 'gemini', () => Promise<string>> = {
  local: () => Promise.resolve(EXTRACTED()),
  gemini: () => Promise.resolve(EXTRACTED()),
};

const EXTRACTED = (changes: Record<string, unknown> = {}) =>
  JSON.stringify({ title: 'Data analyst', keywords: ['sql', 'power bi', 'tableaux de bord'], ...changes });

/** 200 characters or more, with a requirement of experience the code can read, and a recruiter to write to. */
const OFFER = (changes: { years?: string; extra?: string } = {}) =>
  [
    `Data Analyst – Atelier Aurore. ${changes.years ?? '5 ans d’expérience minimum'} sur des projets de données.`,
    'Vous construisez des tableaux de bord avec SQL et Power BI pour douze équipes commerciales.',
    'Écrivez à recrutement@atelier-aurore.example ou appelez le 01 23 45 67 89 pour postuler.',
    changes.extra ?? 'Équipe agile, locaux à Nanterre.',
  ].join('\n');

const scripted = (name: 'local' | 'gemini'): LlmProvider => ({
  name,
  model: `${name}-test`,
  complete: async ({ system, prompt }) => {
    const isScoring = prompt.includes('<candidate_profile>');
    calls.push({ provider: name, task: isScoring ? 'scoring' : 'extraction', system, prompt });
    if (isScoring) {
      const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
      const offers = refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' }));
      return { text: JSON.stringify({ offers }), inputTokens: 10, outputTokens: 5 };
    }
    return { text: await answers[name](), inputTokens: 700, outputTokens: 80 };
  },
});

const board = {
  jobs: [
    {
      id: 1,
      title: 'Data Analyst',
      absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/1',
      location: { name: 'Nanterre' },
      metadata: [],
      content: '&lt;p&gt;SQL et tableaux de bord.&lt;/p&gt;',
      updated_at: '2026-09-18T08:00:00Z',
    },
  ],
};
const collect: AdapterDeps['fetch'] = (url) =>
  Promise.resolve({ url, status: 200, contentType: 'application/json', body: JSON.stringify(board) });

const as = (cookie: string) => ({
  get: (path: string) => request(context.app).get(path).set('Cookie', cookie),
  post: (path: string, body: unknown) =>
    request(context.app)
      .post(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  put: (path: string, body: unknown) =>
    request(context.app)
      .put(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  patch: (path: string, body: unknown) =>
    request(context.app)
      .patch(path)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(body as object),
  delete: (path: string) =>
    request(context.app).delete(path).set('Cookie', cookie).set('Content-Type', 'application/json'),
});

interface Item {
  id: number;
  level: string;
  title: string;
  keywords: string[];
  years: number | null;
  suggestedLevel: string | null;
}

const userIdOf = async (email: string) => {
  const rows = await database.db.select({ id: users.id, email: users.email }).from(users);
  return rows.find((row) => row.email === email)?.id ?? 0;
};

const outcomeOf = async (email: string, response: request.Response) => {
  await context.queue.drain();
  return context.queue.stateOf(await userIdOf(email), (response.body as { runId: number }).runId);
};

const choose = (level: string, text: string, cookie = alice) =>
  as(cookie).post('/api/chosen-offers', { level, text });

/** Chooses an offer and waits for its traits; returns them. */
const chosen = async (
  level: string,
  text: string = OFFER(),
  candidate: { cookie: string; email: string } = { cookie: alice, email: 'alice@example.com' },
) => {
  const response = await choose(level, text, candidate.cookie);
  expect(response.status).toBe(202);
  await outcomeOf(candidate.email, response);
  const list = await listOf(candidate.cookie);
  return list.items.at(-1) as Item;
};

const listOf = async (cookie = alice) =>
  (await as(cookie).get('/api/chosen-offers').expect(200)).body as { items: Item[]; maxPerLevel: number };

beforeEach(async () => {
  await truncateAll(database);
  board.jobs.splice(1);
  calls.length = 0;
  answers.local = () => Promise.resolve(EXTRACTED());
  answers.gemini = () => Promise.resolve(EXTRACTED());
  context = createTestContext(database, {
    collect,
    aiProviders: { local: scripted('local'), gemini: scripted('gemini') },
  });
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('choosing offers by level (T-1012, EF-VEI-48)', () => {
  it('[EF-VEI-48] answers at once with the run, then lists the offer under its level with its traits', async () => {
    const response = await choose('confirme', OFFER());

    expect(response.status).toBe(202);
    expect(await outcomeOf('alice@example.com', response)).toMatchObject({ outcome: 'success' });
    const { items, maxPerLevel } = await listOf();
    expect(maxPerLevel).toBe(3);
    expect(items).toEqual([
      expect.objectContaining({
        level: 'confirme',
        title: 'Data analyst',
        keywords: ['sql', 'power bi', 'tableaux de bord'],
      }),
    ]);
  });

  it('[EF-VEI-48] accepts three offers for a level and refuses a fourth, in French, whatever the order they were read in', async () => {
    for (const title of ['Un', 'Deux', 'Trois']) {
      answers.local = () => Promise.resolve(EXTRACTED({ title }));
      await chosen('junior');
    }

    const fourth = await choose('junior', OFFER());

    expect(fourth.status).toBe(409);
    expect(JSON.stringify(fourth.body)).toContain('3 offres');
    expect((await listOf()).items).toHaveLength(3);
  });

  it('[EF-VEI-48] counts the offers still waiting in the queue, so that a fourth is refused at once', async () => {
    const accepted = await Promise.all([1, 2, 3].map(() => choose('senior', OFFER()).then((r) => r.status)));

    const fourth = await choose('senior', OFFER());
    await context.queue.drain();

    expect(accepted).toEqual([202, 202, 202]);
    expect(fourth.status).toBe(409);
    expect((await listOf()).items).toHaveLength(3);
  });

  it('[EF-VEI-48] gives each level its own three: nine offers in all', async () => {
    for (const level of ['junior', 'confirme', 'senior']) {
      for (let index = 0; index < 3; index += 1) await chosen(level);
    }

    const { items } = await listOf();

    expect(items).toHaveLength(9);
    expect(items.filter((item) => item.level === 'senior')).toHaveLength(3);
  });

  it.each([
    ['199 characters', 'x'.repeat(199), 400],
    ['200 characters', 'x'.repeat(200), 202],
    ['20 000 characters', 'x'.repeat(20_000), 202],
    ['20 001 characters', 'x'.repeat(20_001), 400],
    ['198 characters padded with spaces to 200', ` ${'x'.repeat(198)} `, 400],
  ])('[EF-VEI-48] answers %s with %i', async (_name, text, status) => {
    const response = await choose('junior', text);

    expect(response.status).toBe(status);
    await context.queue.drain();
  });

  it.each([
    ['no level', { text: OFFER() }],
    ['an unknown level', { level: 'expert', text: OFFER() }],
    ['no text', { level: 'junior' }],
    ['a field it does not know', { level: 'junior', text: OFFER(), url: 'https://exemple.fr/offre' }],
  ])('[EF-VEI-48] refuses a request with %s, with a 400', async (_name, body) => {
    await as(alice).post('/api/chosen-offers', body).expect(400);

    expect(await database.db.select().from(jobRuns)).toEqual([]);
  });

  it('[EF-AUT-06] asks for a session and keeps the offers of each candidate apart', async () => {
    await request(context.app).get('/api/chosen-offers').expect(401);
    await request(context.app)
      .post('/api/chosen-offers')
      .send({ level: 'junior', text: OFFER() })
      .expect(401);
    await chosen('junior');

    expect((await listOf(bob)).items).toEqual([]);
    expect(
      (await chosen('junior', OFFER(), { cookie: bob, email: 'bob@example.com' })).id,
    ).not.toBeUndefined();
  });
});

describe('what a request may be (review of the lot 10)', () => {
  it('[ENF-SEC-04] refuses an identifier beyond what the database holds with a 400, not a 500', async () => {
    await as(alice).patch('/api/chosen-offers/99999999999', { title: 'x' }).expect(400);
    await as(alice).delete('/api/chosen-offers/99999999999').expect(400);
  });
});

describe('the traits extracted from a chosen offer (T-1012, EF-VEI-49)', () => {
  it('[EF-VEI-49] [RG-29] [RG-28] reads « 5 ans d’expérience minimum » as 5 years, the level confirmé', async () => {
    const offer = await chosen('confirme', OFFER({ years: '5 ans d’expérience minimum' }));

    expect(offer).toMatchObject({ years: 5, suggestedLevel: 'confirme' });
  });

  it.each([
    ['2 ans d’expérience', 2, 'junior'],
    ['de 3 à 5 ans d’expérience', 5, 'confirme'],
    ['8+ ans d’expérience', 8, 'senior'],
  ])('[EF-VEI-49] [RG-29] reads « %s » as %i years, level %s', async (years, expected, level) => {
    const offer = await chosen('junior', OFFER({ years }));

    expect(offer).toMatchObject({ years: expected, suggestedLevel: level });
  });

  it('[EF-VEI-49] [RG-29] counts the years from the text, never from the model: « 12 ans » made up changes nothing', async () => {
    answers.local = () => Promise.resolve(EXTRACTED({ years: 12, level: 'senior' }));

    const offer = await chosen('confirme', OFFER({ years: '5 ans d’expérience minimum' }));

    expect(offer).toMatchObject({ years: 5, suggestedLevel: 'confirme' });
    expect(JSON.stringify(offer)).not.toContain('12');
  });

  it('[EF-VEI-49] [RG-28] keeps no years for an offer that demands none, and reads its level in its title', async () => {
    answers.local = () => Promise.resolve(EXTRACTED({ title: 'Data engineer senior' }));

    const offer = await chosen('senior', OFFER({ years: 'Rejoignez-nous' }));

    expect(offer).toMatchObject({ years: null, suggestedLevel: 'senior' });
  });

  it('[EF-VEI-49] [RG-28] says « non précisé » when neither the text nor the title tell the level', async () => {
    const offer = await chosen('junior', OFFER({ years: 'Rejoignez-nous' }));

    expect(offer).toMatchObject({ years: null, suggestedLevel: null });
  });

  it('[EF-IA-03] asks the next provider when the answer is outside the schema, and fails when none answers', async () => {
    answers.local = () => Promise.resolve(JSON.stringify({ title: 'Data analyst', keywords: [] }));
    await chosen('junior');
    expect(calls.filter((call) => call.task === 'extraction').map((call) => call.provider)).toEqual([
      'local',
      'gemini',
    ]);

    answers.gemini = () => Promise.resolve('not json');
    const response = await choose('junior', OFFER());
    const state = await outcomeOf('alice@example.com', response);

    expect(state).toMatchObject({ outcome: 'failure' });
    expect(state?.error).toContain('Aucun service d’IA');
    expect((await listOf()).items).toHaveLength(1);
  });

  it('[EF-IA-08] gives the first call to the local model, then to the hosted ones when it fails', async () => {
    await chosen('junior');
    expect(calls.map((call) => call.provider)).toEqual(['local']);

    answers.local = () => Promise.reject(new Error('connection refused'));
    await chosen('junior');

    expect(calls.map((call) => call.provider)).toEqual(['local', 'local', 'gemini']);
  });

  it('[ENF-RGP-13] [ENF-RGP-09] sends the text of the offer without the e-mail address and the phone of the recruiter', async () => {
    await chosen('junior');

    const sent = `${calls[0]?.system ?? ''}${calls[0]?.prompt ?? ''}`;
    expect(sent).toContain('tableaux de bord avec SQL et Power BI');
    expect(sent).not.toMatch(/recrutement@atelier-aurore\.example|01 23 45 67 89/u);
    expect(sent).not.toMatch(/alice@example\.com/u);
  });

  it('[EF-VEI-49] lets the candidate correct the title, the keywords, the years and the level', async () => {
    const offer = await chosen('confirme');

    const response = await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, {
        title: 'Analyste BI',
        keywords: ['bi', 'sql'],
        years: 3,
        level: 'confirme',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      title: 'Analyste BI',
      keywords: ['bi', 'sql'],
      years: 3,
      suggestedLevel: 'confirme',
    });
    expect((await listOf()).items[0]).toMatchObject({ title: 'Analyste BI', years: 3 });
  });

  it('[EF-VEI-49] lets the candidate say the offer demands no years at all (null), and gives the suggested level of what is left', async () => {
    const offer = await chosen('confirme');

    const response = await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, { years: null })
      .expect(200);

    expect(response.body).toMatchObject({ years: null, suggestedLevel: null });
  });

  it('[EF-VEI-49] moves an offer to another level when the candidate corrects it, within the three of that level', async () => {
    const offer = await chosen('junior');
    for (let index = 0; index < 3; index += 1) await chosen('senior');

    await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, { level: 'senior' })
      .expect(409);
    const moved = await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, { level: 'confirme' })
      .expect(200);

    expect(moved.body).toMatchObject({ level: 'confirme' });
  });

  it.each([
    ['years above 50', { years: 51 }],
    ['negative years', { years: -1 }],
    ['fractional years', { years: 2.5 }],
    ['an empty title', { title: ' ' }],
    ['a title of 81 characters', { title: 'x'.repeat(81) }],
    ['no keyword', { keywords: [] }],
    ['sixteen keywords', { keywords: Array.from({ length: 16 }, (_u, i) => `m${String(i)}`) }],
    ['an unknown level', { level: 'expert' }],
    ['nothing to change', {}],
    ['a field it does not know', { text: OFFER() }],
  ])('[EF-VEI-49] refuses a correction with %s, with a 400', async (_name, body) => {
    const offer = await chosen('junior');

    await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, body)
      .expect(400);

    expect((await listOf()).items[0]).toMatchObject({ title: 'Data analyst', years: 5 });
  });

  it('[EF-AUT-06] knows no offer of another account, nor one that is gone', async () => {
    const offer = await chosen('junior');

    await as(bob)
      .patch(`/api/chosen-offers/${String(offer.id)}`, { title: 'x' })
      .expect(404);
    await as(bob)
      .delete(`/api/chosen-offers/${String(offer.id)}`)
      .expect(404);
    await as(alice).patch('/api/chosen-offers/999999', { title: 'x' }).expect(404);
    await as(alice).delete('/api/chosen-offers/999999').expect(404);
    expect((await listOf()).items).toHaveLength(1);
  });

  it('[EF-VEI-48] deletes an offer, and frees its place', async () => {
    for (let index = 0; index < 3; index += 1) await chosen('junior');
    const [first] = (await listOf()).items;

    await as(alice)
      .delete(`/api/chosen-offers/${String(first?.id)}`)
      .expect(204);
    await chosen('junior');

    expect((await listOf()).items).toHaveLength(3);
  });
});

describe('what is kept of a chosen offer (T-1012, ENF-RGP-14)', () => {
  it('[ENF-RGP-14] keeps the level, the title, the keywords and the years — and the text of the offer in no table at all', async () => {
    await chosen('confirme');

    const [row] = await database.db.select().from(chosenOffers);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['createdAt', 'id', 'keywords', 'level', 'title', 'updatedAt', 'userId', 'years'].sort(),
    );
    for (const needle of [
      'Équipe agile',
      'douze équipes commerciales',
      'recrutement@atelier-aurore',
      '01 23 45 67 89',
    ]) {
      expect(await tablesHolding(database, needle), needle).toEqual([]);
    }
  });

  it('[ENF-RGP-12] journals the runs and the calls without a word of the offer nor of the answer', async () => {
    await chosen('confirme');

    const runs = await database.db.select().from(jobRuns).orderBy(asc(jobRuns.id));
    expect(runs).toEqual([expect.objectContaining({ job: 'offer_extraction', outcome: 'success' })]);
    expect(await database.db.select().from(llmCalls)).toEqual([
      expect.objectContaining({ task: 'extract_offer_traits', outcome: 'success' }),
    ]);
    expect(JSON.stringify(runs)).not.toContain('Atelier Aurore');
  });

  it('[ENF-COU-01] allows 20 extractions a day, then answers 429, and counts neither the failed ones nor another candidate’s', async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await choose('junior', OFFER());
      expect(response.status, String(index)).toBe(202);
      await context.queue.drain();
      const { items } = await listOf();
      if (items.length >= 3) await as(alice).delete(`/api/chosen-offers/${String(items[0]?.id)}`);
    }

    expect((await choose('junior', OFFER())).status).toBe(429);
    expect((await choose('junior', OFFER(), bob)).status).toBe(202);
    context.clock.advanceDays(1);
    expect((await choose('junior', OFFER())).status).toBe(202);
    await context.queue.drain();
  });
});

describe('the allowance against requests sent together, and the places of a level (review of the lot 10)', () => {
  it('[ENF-COU-01] holds the allowance of 20 against six requests sent together when two are left', async () => {
    for (let index = 0; index < 18; index += 1) {
      expect((await choose('junior', OFFER())).status, String(index)).toBe(202);
      await context.queue.drain();
      const { items } = await listOf();
      if (items.length >= 3) await as(alice).delete(`/api/chosen-offers/${String(items[0]?.id)}`);
    }
    const [first, second] = (await listOf()).items;
    await as(alice).delete(`/api/chosen-offers/${String(first?.id)}`);
    await as(alice).delete(`/api/chosen-offers/${String(second?.id)}`);

    const statuses = await Promise.all(
      ['junior', 'junior', 'confirme', 'confirme', 'senior', 'senior'].map((level) =>
        choose(level, OFFER()).then((response) => response.status),
      ),
    );
    await context.queue.drain();

    expect(statuses.filter((status) => status === 202)).toHaveLength(2);
    expect(statuses.filter((status) => status === 429)).toHaveLength(4);
  });

  it('[EF-VEI-48] never makes four offers of a level when two corrections to that level arrive together', async () => {
    const mine = [await chosen('senior'), await chosen('senior')];
    const movers = [await chosen('junior'), await chosen('confirme')];

    const statuses = await Promise.all(
      movers.map((offer) =>
        as(alice)
          .patch(`/api/chosen-offers/${String(offer.id)}`, { level: 'senior' })
          .then((response) => response.status),
      ),
    );

    expect(mine).toHaveLength(2);
    expect(statuses.sort()).toEqual([200, 409]);
    expect((await listOf()).items.filter((item) => item.level === 'senior')).toHaveLength(3);
  });
});

describe('the chosen offers in the scoring (T-1012, EF-VEI-50)', () => {
  const CRITERIA = {
    targets: [{ label: 'Analyste de données', keywords: ['data', 'sql'], contractTypes: ['cdi'] }],
    place: NANTERRE,
    radiusKm: 30,
    acceptsRemote: true,
    romeCodes: [],
  };

  /** A pass over a board that published a new offer since the last one: only a new offer is scored. */
  const scoringPrompts = async (criteria: Record<string, unknown>) => {
    const [first] = board.jobs;
    if (first) {
      const id = board.jobs.length + 1;
      board.jobs.push({
        ...first,
        id,
        absolute_url: `https://boards.greenhouse.io/atelieraurore/jobs/${String(id)}`,
      });
    }
    await as(alice)
      .put('/api/watch/criteria', { ...CRITERIA, ...criteria })
      .expect(200);
    calls.length = 0;
    await as(alice).post('/api/sites/run', {}).expect(202);
    await context.queue.drain();
    return calls.filter((call) => call.task === 'scoring').map((call) => `${call.system}\n${call.prompt}`);
  };

  beforeEach(async () => {
    await as(alice)
      .post('/api/sites', {
        companyName: 'Atelier Aurore',
        adapter: 'greenhouse',
        identifier: 'atelieraurore',
      })
      .expect(201);
  });

  it('[EF-VEI-50] carries the titles of the offers chosen for the level of the candidate, and only theirs', async () => {
    answers.local = () =>
      Promise.resolve(EXTRACTED({ title: 'Analytics engineer senior', keywords: ['dbt'] }));
    await chosen('senior');
    answers.local = () =>
      Promise.resolve(EXTRACTED({ title: 'Assistant data stagiaire', keywords: ['excel'] }));
    await chosen('junior');

    const [senior] = await scoringPrompts({ years: 9 });
    const [junior] = await scoringPrompts({ years: 1 });

    expect(senior).toContain('Analytics engineer senior');
    expect(senior).toContain('dbt');
    expect(senior).not.toContain('Assistant data stagiaire');
    expect(junior).toContain('Assistant data stagiaire');
    expect(junior).not.toContain('Analytics engineer senior');
  });

  it('[EF-VEI-50] carries no chosen offer for a candidate who has no level', async () => {
    await chosen('senior');

    const [prompt] = await scoringPrompts({});

    expect(prompt).not.toContain('Offres que le candidat a choisies');
  });

  it('[EF-VEI-50] never carries the offers of another candidate', async () => {
    answers.local = () => Promise.resolve(EXTRACTED({ title: 'Titre de Bob', keywords: ['bob'] }));
    await chosen('senior', OFFER(), { cookie: bob, email: 'bob@example.com' });

    const [prompt] = await scoringPrompts({ years: 9 });

    expect(prompt).not.toContain('Titre de Bob');
  });

  it('[EF-VEI-50] takes a correction into account: the scoring reads the title as the candidate left it', async () => {
    const offer = await chosen('senior');
    await as(alice)
      .patch(`/api/chosen-offers/${String(offer.id)}`, { title: 'Titre corrigé' })
      .expect(200);

    const [prompt] = await scoringPrompts({ years: 9 });

    expect(prompt).toContain('Titre corrigé');
  });
});
