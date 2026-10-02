import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { watchCriteria } from '../../src/db/schema.js';
import type { LlmProvider } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import { buildTextPdf, FICTITIOUS_CV_LINES } from '../fixtures/cv/pdf.js';
import {
  createTestContext,
  NANTERRE,
  openTestDatabase,
  registerUser,
  type TestContext,
  truncateAll,
} from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;
let bob: string;
/** Everything the models were asked: the scoring of the offers reads the targets there. */
const asked: string[] = [];

const DEDUCTION = readFileSync(new URL('../fixtures/llm/deduce_profile.json', import.meta.url), 'utf8');

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

/** The model of the test: it deduces a profile from a CV, and scores every offer it is given. */
const ai: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: ({ system, prompt }) => {
    asked.push(`${system}\n${prompt}`);
    if (system.includes('Tu lis le CV')) {
      return Promise.resolve({ text: DEDUCTION, inputTokens: 900, outputTokens: 300 });
    }
    const refs = [...prompt.matchAll(/<offer ref="(\d+)">/gu)].map((match) => Number(match[1]));
    return Promise.resolve({
      text: JSON.stringify({ offers: refs.map((ref) => ({ ref, score: 70, reason: 'Proche.' })) }),
      inputTokens: 10,
      outputTokens: 5,
    });
  },
};

const SAVED = {
  targets: [{ label: 'Analyste de données', keywords: ['data', 'statistiques'], contractTypes: ['cdi'] }],
  place: NANTERRE,
  radiusKm: 45,
  acceptsRemote: false,
  romeCodes: ['M1203'],
};

const VALIDATED = {
  years: 3,
  targets: [
    { label: 'Data analyst', keywords: ['sql', 'power bi'], contractTypes: ['cdi', 'alternance'] },
    { label: 'Analytics engineer', keywords: ['dbt', 'sql'], contractTypes: ['cdi'] },
  ],
};

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
});

const validate = (body: unknown, cookie = alice) => as(cookie).post('/api/watch/criteria/validation', body);
const criteriaOf = async (cookie = alice) =>
  (
    (await as(cookie).get('/api/watch/criteria').expect(200)).body as {
      criteria: Record<string, unknown> | null;
    }
  ).criteria;

/** A pass the candidate asks for, and what the model was asked while it ran. */
const passAsked = async () => {
  asked.length = 0;
  await as(alice).post('/api/sites/run', {}).expect(202);
  await context.queue.drain();
  return asked.filter((text) => text.includes('<offer ')).join('\n');
};

beforeEach(async () => {
  await truncateAll(database);
  asked.length = 0;
  context = createTestContext(database, { collect, aiProviders: { gemini: ai } });
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
  await as(alice)
    .post('/api/sites', { companyName: 'Atelier Aurore', adapter: 'greenhouse', identifier: 'atelieraurore' })
    .expect(201);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('validating the profile deduced from the CV types (T-1011, EF-VEI-46)', () => {
  it('[EF-VEI-46] scores with the saved criteria only, while the deduced profile is not validated', async () => {
    await as(alice).put('/api/watch/criteria', SAVED).expect(200);
    await as(alice)
      .post('/api/cv-types', {
        label: 'Data analyst',
        file: buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64'),
      })
      .expect(202);
    await context.queue.drain();

    const prompt = await passAsked();

    // A profile was deduced — its offers wait for the candidate — and the scoring has never heard of it.
    expect(prompt).toContain('Analyste de données');
    expect(prompt).not.toContain('Analytics engineer');
    expect(await criteriaOf()).toMatchObject({ targets: [{ label: 'Analyste de données' }] });
  });

  it('[EF-VEI-46] scores with the validated criteria once the candidate validated them', async () => {
    await as(alice).put('/api/watch/criteria', SAVED).expect(200);

    await validate(VALIDATED).expect(200);
    const prompt = await passAsked();

    expect(prompt).toContain('Analytics engineer');
    expect(prompt).not.toContain('Analyste de données');
  });

  it('[EF-VEI-46] writes the validated offers as the targets of the criteria and keeps the rest of the search as it was', async () => {
    await as(alice).put('/api/watch/criteria', SAVED).expect(200);

    const response = await validate(VALIDATED).expect(200);

    const { criteria } = response.body as { criteria: Record<string, unknown> };
    expect(criteria).toMatchObject({
      targets: VALIDATED.targets,
      years: 3,
      level: 'confirme',
      // The commune, the radius, the remote work and the ROME codes are not the profile's to change.
      place: NANTERRE,
      radiusKm: 45,
      acceptsRemote: false,
      romeCodes: ['M1203'],
    });
    expect(await criteriaOf()).toEqual(criteria);
  });

  it('[EF-VEI-46] makes criteria of its own for a candidate who had none: the whole of France, remote work accepted', async () => {
    expect(await criteriaOf()).toBeNull();

    await validate(VALIDATED).expect(200);

    expect(await criteriaOf()).toMatchObject({
      place: null,
      radiusKm: 30,
      acceptsRemote: true,
      romeCodes: [],
      targets: VALIDATED.targets,
    });
  });
});

describe('correcting the profile before validating it (T-1011, EF-VEI-47)', () => {
  it.each([
    [2, 'junior'],
    [3, 'confirme'],
    [6, 'confirme'],
    [7, 'confirme'],
    [8, 'senior'],
  ])('[EF-VEI-47] [RG-28] gives the level of %i corrected years: %s', async (years, level) => {
    const response = await validate({ ...VALIDATED, years }).expect(200);

    expect(response.body).toMatchObject({ criteria: { years, level } });
  });

  it('[EF-VEI-47] recomputes the level from corrected years, the one deduced from 3 years included', async () => {
    await validate({ ...VALIDATED, years: 3 }).expect(200);

    const response = await validate({ ...VALIDATED, years: 9 }).expect(200);

    expect(response.body).toMatchObject({ criteria: { years: 9, level: 'senior' } });
  });

  it('[EF-VEI-47] lets the years win over a level given beside them', async () => {
    const response = await validate({ ...VALIDATED, years: 1, level: 'senior' }).expect(200);

    expect(response.body).toMatchObject({ criteria: { years: 1, level: 'junior' } });
  });

  it('[EF-VEI-47] keeps the level the candidate chose when they give no years', async () => {
    const response = await validate({ targets: VALIDATED.targets, level: 'senior' }).expect(200);

    const { criteria } = response.body as { criteria: Record<string, unknown> };
    expect(criteria['level']).toBe('senior');
    expect(criteria).not.toHaveProperty('years');
  });

  it('[EF-VEI-47] drops the years and the level of a validation that gives neither', async () => {
    await validate({ ...VALIDATED, years: 9 }).expect(200);

    const response = await validate({ targets: VALIDATED.targets }).expect(200);

    const { criteria } = response.body as { criteria: Record<string, unknown> };
    expect(criteria).not.toHaveProperty('years');
    expect(criteria).not.toHaveProperty('level');
  });

  it.each([[-1], [51], [3.5], ['trois']])(
    '[EF-VEI-47] refuses %s years with a 400, and saves nothing',
    async (years) => {
      await validate({ ...VALIDATED, years }).expect(400);

      expect(await database.db.select().from(watchCriteria)).toEqual([]);
    },
  );

  it('[EF-VEI-47] accepts the bounds, 0 and 50 years', async () => {
    await validate({ ...VALIDATED, years: 0 }).expect(200);
    await validate({ ...VALIDATED, years: 50 }).expect(200);
  });

  it('[EF-VEI-47] lets the candidate correct the offers: renamed, keywords added, a contract removed', async () => {
    const corrected = {
      years: 3,
      targets: [{ label: 'Analyste BI', keywords: ['bi', 'sql', 'tableau'], contractTypes: ['alternance'] }],
    };

    const response = await validate(corrected).expect(200);

    expect(response.body).toMatchObject({ criteria: { targets: corrected.targets } });
  });

  it.each([
    ['no offer', { ...VALIDATED, targets: [] }],
    ['six offers', { ...VALIDATED, targets: Array(6).fill(VALIDATED.targets[0]) }],
    ['an offer with no keyword', { ...VALIDATED, targets: [{ ...VALIDATED.targets[0], keywords: [] }] }],
    [
      'an offer with no contract',
      { ...VALIDATED, targets: [{ ...VALIDATED.targets[0], contractTypes: [] }] },
    ],
    ['an unknown level', { ...VALIDATED, level: 'expert' }],
    ['no body at all', {}],
    ['a field it does not know', { ...VALIDATED, place: NANTERRE }],
  ])('[EF-VEI-47] refuses a validation with %s, with a 400', async (_name, body) => {
    await validate(body).expect(400);

    expect(await database.db.select().from(watchCriteria)).toEqual([]);
  });
});

describe('who may validate (T-1011, EF-AUT-06, ENF-MAI-07)', () => {
  it('[EF-AUT-06] asks for a session, and writes the criteria of the candidate who validates, nobody else’s', async () => {
    await request(context.app).post('/api/watch/criteria/validation').send(VALIDATED).expect(401);

    await validate(VALIDATED).expect(200);

    expect(await criteriaOf()).not.toBeNull();
    expect(await criteriaOf(bob)).toBeNull();
  });

  it('[ENF-MAI-07] is no route of a deployment without the watch', async () => {
    const without = createTestContext(database, { features: new Set() });
    const cookie = await registerUser(without.app, 'carol@example.com');

    const response = await request(without.app)
      .post('/api/watch/criteria/validation')
      .set('Cookie', cookie)
      .send(VALIDATED);

    expect(response.status).toBe(404);
  });
});
