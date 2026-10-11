import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { cvTypes, jobRuns, llmCalls, users, watchCriteria } from '../../src/db/schema.js';
import type { RunState } from '../../src/jobs/queue.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import { CriteriaTargetSchema } from '../../src/modules/criteria/schemas.js';
import { buildLockedPdf, buildTextPdf, FICTITIOUS_CV_LINES } from '../fixtures/cv/pdf.js';
import {
  createTestContext,
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

const DEDUCTION = readFileSync(new URL('../fixtures/llm/deduce_profile.json', import.meta.url), 'utf8');

/** What the models of the test were asked, and by which provider. */
const calls: { provider: ProviderName; system: string; prompt: string }[] = [];
/** What each provider answers; a function so that a test changes it between two calls. */
const answers: Record<'local' | 'gemini', () => Promise<string>> = {
  local: () => Promise.resolve(DEDUCTION),
  gemini: () => Promise.resolve(DEDUCTION),
};

const scripted = (name: 'local' | 'gemini'): LlmProvider => ({
  name,
  model: `${name}-test`,
  complete: async ({ system, prompt }) => {
    calls.push({ provider: name, system, prompt });
    return { text: await answers[name](), inputTokens: 900, outputTokens: 300 };
  },
});

const cvBase64 = (lines: readonly string[] = FICTITIOUS_CV_LINES): string =>
  buildTextPdf([[...lines]]).toString('base64');

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
  delete: (path: string) =>
    request(context.app).delete(path).set('Cookie', cookie).set('Content-Type', 'application/json'),
});

const userIdOf = async (email: string) => {
  const rows = await database.db.select({ id: users.id, email: users.email }).from(users);
  return rows.find((row) => row.email === email)?.id ?? 0;
};

const outcomeOf = async (email: string, response: request.Response): Promise<RunState | null> => {
  await context.queue.drain();
  return context.queue.stateOf(await userIdOf(email), (response.body as { runId: number }).runId);
};

/** Imports a CV type and waits for the run; returns its id. */
const importCv = async (label: string, lines: readonly string[] = FICTITIOUS_CV_LINES, cookie = alice) => {
  const response = await as(cookie).post('/api/cv-types', { label, file: cvBase64(lines) });
  expect(response.status).toBe(202);
  await outcomeOf(cookie === alice ? 'alice@example.com' : 'bob@example.com', response);
  const list = (await as(cookie).get('/api/cv-types')).body as { items: { id: number; label: string }[] };
  return list.items.find((item) => item.label === label)?.id ?? 0;
};

const deductionOf = (id: number, cookie = alice) => as(cookie).get(`/api/cv-types/${String(id)}/deduction`);

beforeEach(async () => {
  await truncateAll(database);
  calls.length = 0;
  answers.local = () => Promise.resolve(DEDUCTION);
  answers.gemini = () => Promise.resolve(DEDUCTION);
  context = createTestContext(database, {
    aiProviders: { local: scripted('local'), gemini: scripted('gemini') },
  });
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('deducing the profile of a CV type (T-1010, EF-VEI-43, EF-VEI-45)', () => {
  it('[EF-VEI-43] [RG-29] shows the years the code counts from the periods — 34 months, 3 years — not the 12 the model made up', async () => {
    const id = await importCv('Data analyst');

    const [row] = await database.db.select().from(cvTypes);
    expect(row).toMatchObject({ id, years: 3, level: 'confirme' });
    const deduction = (await deductionOf(id)).body as { years: number; level: string };
    expect(deduction).toMatchObject({ years: 3, level: 'confirme' });
    expect(JSON.stringify(deduction)).not.toContain('12');
    const list = (await as(alice).get('/api/cv-types')).body as { items: { years: number; level: string }[] };
    expect(list.items[0]).toMatchObject({ years: 3, level: 'confirme' });
  });

  it('[EF-VEI-44] [RG-28] gives the level of the years: a CV with no experience is junior, 0 years', async () => {
    answers.local = () => Promise.resolve(JSON.stringify({ ...JSON.parse(DEDUCTION), periods: [] }));

    const id = await importCv('Débutant');

    expect((await deductionOf(id)).body).toMatchObject({ years: 0, level: 'junior' });
  });

  it('[EF-VEI-45] proposes from one to five offers in the shape of the criteria, with their level', async () => {
    const id = await importCv('Data analyst');

    const { targets } = (await deductionOf(id)).body as { targets: Record<string, unknown>[] };

    expect(targets).toHaveLength(2);
    for (const { level, ...target } of targets) {
      expect(CriteriaTargetSchema.safeParse(target).success).toBe(true);
      expect(['junior', 'confirme', 'senior']).toContain(level);
    }
  });

  it('[EF-VEI-45] proposes at least two offers for two CVs of different profiles', async () => {
    const engineer = {
      periods: [{ start: '2018-01', end: 'present' }],
      targets: [
        { label: 'Data engineer', keywords: ['spark', 'airflow'], contractTypes: ['cdi'], level: 'senior' },
      ],
    };
    const first = await importCv('Analyste');
    answers.local = () => Promise.resolve(JSON.stringify(engineer));
    const second = await importCv('Ingénieur', [
      'Data Engineer',
      '01/2020 - présent  Data Engineer - Atelier Delta',
    ]);

    const labels = [first, second].map(
      async (id) => ((await deductionOf(id)).body as { targets: { label: string }[] }).targets,
    );
    const all = (await Promise.all(labels)).flat().map((target) => target.label);

    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all).toEqual(expect.arrayContaining(['Data analyst', 'Data engineer']));
    expect((await deductionOf(second)).body).toMatchObject({ level: 'senior' });
  });

  it('[EF-IA-03] refuses an answer outside the schema and asks the next provider, which answers', async () => {
    answers.local = () =>
      Promise.resolve(
        JSON.stringify({
          periods: [],
          // No offer of this answer can be used: a contract that does not exist, and a period that is no month.
          targets: [{ label: 'x', keywords: ['a'], contractTypes: ['freelance'], level: 'junior' }],
        }),
      );

    const id = await importCv('Data analyst');

    expect(calls.map((call) => call.provider)).toEqual(['local', 'gemini']);
    expect((await deductionOf(id)).status).toBe(200);
  });

  it('[EF-IA-08] uses the answer of the local model despite its slips — a level typed « junor », a made-up contract, « null » for an end — instead of paying a hosted provider', async () => {
    answers.local = () =>
      Promise.resolve(
        JSON.stringify({
          periods: [
            { start: '09/2022', end: '2024-08', label: 'Data analyst' },
            { start: '2024-09', end: 'null' },
          ],
          targets: [
            {
              label: 'Data analyst',
              keywords: ['sql', 'SQL'],
              contractTypes: ['cdn', 'cdi'],
              level: 'junor',
            },
            { label: 'Sans contrat', keywords: ['sql'], contractTypes: ['cdn'], level: 'junior' },
          ],
        }),
      );

    const id = await importCv('Data analyst');

    expect(calls.map((call) => call.provider)).toEqual(['local']);
    const deduction = (await deductionOf(id)).body as { years: number; targets: Record<string, unknown>[] };
    // 09/2022 to 08/2024, then 09/2024 up to the day of the test clock (22 September 2026): 49 months, 4 years.
    expect(deduction.years).toBe(4);
    expect(deduction.targets).toEqual([
      { label: 'Data analyst', keywords: ['sql'], contractTypes: ['cdi'], level: 'confirme' },
    ]);
  });

  it('[EF-IA-04] ends the run in failure, with the reason, when no provider can answer — and keeps nothing', async () => {
    answers.local = () => Promise.resolve('not json at all');
    answers.gemini = () => Promise.reject(new Error('quota exceeded'));
    const response = await as(alice).post('/api/cv-types', { label: 'Data analyst', file: cvBase64() });

    const state = await outcomeOf('alice@example.com', response);

    expect(state).toMatchObject({ outcome: 'failure' });
    expect(state?.error).toContain('Aucun service d’IA');
    expect(await database.db.select().from(cvTypes)).toEqual([]);
  });

  it('[EF-CVX-43] answers at once, before the model has answered, then publishes the steps « lecture » and « déduction »', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<string>((resolve) => {
      release = () => resolve(DEDUCTION);
    });
    answers.local = () => gate;
    const userId = await userIdOf('alice@example.com');
    const steps: number[] = [];
    context.queue.follow(userId, (state) => {
      const step = state.counters.cv_steps_done;
      if (step !== undefined && steps.at(-1) !== step) steps.push(step);
    });

    const startedAt = Date.now();
    const response = await as(alice).post('/api/cv-types', { label: 'Data analyst', file: cvBase64() });
    const answeredIn = Date.now() - startedAt;
    release();
    const state = await outcomeOf('alice@example.com', response);

    expect(response.status).toBe(202);
    expect(answeredIn).toBeLessThan(1000);
    expect(steps).toEqual([1, 2]);
    expect(state).toMatchObject({ outcome: 'success', counters: { cv_steps_done: 2 } });
  });

  it('[EF-AUT-06] hands the deduction to its owner only, and says so in French when there is none', async () => {
    const id = await importCv('Data analyst');

    expect((await deductionOf(id, bob)).status).toBe(404);
    expect((await deductionOf(999_999)).status).toBe(404);
    await request(context.app)
      .get(`/api/cv-types/${String(id)}/deduction`)
      .expect(401);
  });
});

describe('who reads the CV (T-1010, EF-IA-08, ENF-RGP-13)', () => {
  it('[EF-IA-08] gives the first call to the local model, then to the hosted ones when it fails', async () => {
    await importCv('Data analyst');
    expect(calls.map((call) => call.provider)).toEqual(['local']);

    answers.local = () => Promise.reject(new Error('connection refused'));
    await importCv('Python');

    expect(calls.map((call) => call.provider)).toEqual(['local', 'local', 'gemini']);
  });

  it('[ENF-RGP-13] sends the text of the CV and nothing that names the candidate: no address, no phone, no label, no account', async () => {
    await importCv('Étiquette secrète');

    const [call] = calls;
    expect(call?.prompt).toContain('Atelier Nova');
    const sent = `${call?.system ?? ''}${call?.prompt ?? ''}`;
    expect(sent).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78|12 rue des Lilas|linkedin\.com/u);
    expect(sent).not.toMatch(/Étiquette secrète|alice@example\.com/u);
  });

  it('[EF-VEI-43] never asks the model for a number of years', async () => {
    await importCv('Data analyst');

    expect(calls[0]?.system).toContain('n’écris aucun nombre d’années');
  });
});

describe('what the deduction leaves behind (T-1010, ENF-RGP-12, EF-VEI-46)', () => {
  it('[EF-VEI-46] changes no criteria: the offers proposed wait for the candidate’s validation', async () => {
    await importCv('Data analyst');

    expect(await database.db.select().from(watchCriteria)).toEqual([]);
  });

  it('[ENF-RGP-12] [ENF-RGP-14] keeps neither the text of the CV nor the answer of the model in any table', async () => {
    await importCv('Data analyst');

    for (const needle of [
      'Atelier Nova',
      'Tableaux de bord Power BI',
      'Analytics engineer',
      'power bi',
      'dbt',
    ]) {
      expect(await tablesHolding(database, needle), needle).toEqual([]);
    }
    const [call] = await database.db.select().from(llmCalls);
    expect(call).toMatchObject({ task: 'deduce_profile', outcome: 'success' });
    expect(JSON.stringify(await database.db.select().from(jobRuns))).not.toContain('Atelier Nova');
  });

  it('[EF-CVX-41] replaces the profile: the deduction is the new one, the years are counted again', async () => {
    const id = await importCv('Data analyst');
    answers.local = () =>
      Promise.resolve(
        JSON.stringify({
          periods: [{ start: '2016-01', end: '2024-12' }],
          targets: [
            { label: 'Lead data', keywords: ['management'], contractTypes: ['cdi'], level: 'senior' },
          ],
        }),
      );

    const response = await as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() });
    await outcomeOf('alice@example.com', response);

    const deduction = (await deductionOf(id)).body as {
      years: number;
      level: string;
      targets: { label: string }[];
    };
    expect(deduction).toMatchObject({ years: 9, level: 'senior' });
    expect(deduction.targets.map((target) => target.label)).toEqual(['Lead data']);
    expect(await database.db.select({ years: cvTypes.years }).from(cvTypes)).toEqual([{ years: 9 }]);
  });

  it('[EF-CVX-41] keeps the old profile when the new file cannot be read or deduced from', async () => {
    const id = await importCv('Data analyst');
    const unreadable = await as(alice).put(`/api/cv-types/${String(id)}`, {
      file: buildLockedPdf(['Secret']).toString('base64'),
    });
    await outcomeOf('alice@example.com', unreadable);
    answers.local = () => Promise.resolve('not json');
    answers.gemini = () => Promise.resolve('not json either');
    const undeducible = await as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() });
    await outcomeOf('alice@example.com', undeducible);

    expect((await deductionOf(id)).body).toMatchObject({ years: 3, level: 'confirme' });
    expect(await database.db.select({ years: cvTypes.years }).from(cvTypes)).toEqual([{ years: 3 }]);
  });

  it('[EF-CVX-42] erases the deduction with the CV type', async () => {
    const id = await importCv('Data analyst');

    await as(alice)
      .delete(`/api/cv-types/${String(id)}`)
      .expect(204);

    expect((await deductionOf(id)).status).toBe(404);
  });

  it('[EF-CVX-43] says in the list which CV types have a deduction to validate', async () => {
    const id = await importCv('Data analyst');

    const list = (await as(alice).get('/api/cv-types')).body as {
      items: { id: number; deductionReady: boolean }[];
    };
    expect(list.items).toEqual([expect.objectContaining({ id, deductionReady: true })]);
  });
});

describe('the daily allowance of deductions (T-1010, EF-CVX-44)', () => {
  const startImport = (label: string) => as(alice).post('/api/cv-types', { label, file: cvBase64() });

  it('[EF-CVX-44] refuses a sixth deduction of the day with a 429 and a message, and accepts it the next day', async () => {
    const id = await importCv('Un');
    for (const label of ['Deux', 'Trois', 'Quatre']) await importCv(label);
    await outcomeOf(
      'alice@example.com',
      await as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() }),
    );

    const sixth = await startImport('Cinq');
    const replaced = await as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() });

    expect(sixth.status).toBe(429);
    expect(JSON.stringify(sixth.body)).toContain('5');
    expect(replaced.status).toBe(429);

    context.clock.advanceDays(1);
    await as(alice)
      .delete(`/api/cv-types/${String(id)}`)
      .expect(204);
    expect((await startImport('Cinq')).status).toBe(202);
    await context.queue.drain();
  });

  it('[EF-CVX-44] [ENF-COU-01] holds the allowance against requests sent together: ten replacements at once give four runs, not ten', async () => {
    const id = await importCv('Un');

    const statuses = await Promise.all(
      Array.from({ length: 10 }, () => as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() })),
    ).then((responses) => responses.map((response) => response.status));
    await context.queue.drain();

    // The import of « Un » was the first of the five of the day.
    expect(statuses.filter((status) => status === 202)).toHaveLength(4);
    expect(statuses.filter((status) => status === 429)).toHaveLength(6);
  });

  it('[EF-CVX-44] does not count a deduction that failed', async () => {
    answers.local = () => Promise.resolve('nope');
    answers.gemini = () => Promise.resolve('nope');
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await outcomeOf('alice@example.com', await startImport('Raté'));
    }
    answers.local = () => Promise.resolve(DEDUCTION);

    expect((await startImport('Réussi')).status).toBe(202);
    await context.queue.drain();
  });

  it('[EF-CVX-44] counts the days of each candidate apart', async () => {
    for (let index = 0; index < 4; index += 1) await importCv(`CV ${String(index)}`);
    await importCv('Cinquième', FICTITIOUS_CV_LINES, bob);

    expect((await as(bob).post('/api/cv-types', { label: 'Autre', file: cvBase64() })).status).toBe(202);
    await context.queue.drain();
  });
});
