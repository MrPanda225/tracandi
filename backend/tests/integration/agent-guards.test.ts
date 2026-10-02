import { readFileSync } from 'node:fs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { discoveredSources, watchedSites } from '../../src/db/schema.js';
import type { LlmProvider, ProviderName } from '../../src/llm/types.js';
import type { AdapterDeps } from '../../src/scraper/adapters/types.js';
import { buildTextPdf } from '../fixtures/cv/pdf.js';
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
let logged: string[];
let asked: { provider: ProviderName; system: string; prompt: string }[];
/** What the models answer, by task: a test changes it. */
let answerFor: (task: string, provider: ProviderName) => string | Error;
let fetched: string[];
let pages: Record<string, string>;

const CAREER_PAGE = readFileSync(
  new URL('../fixtures/ats/generic-career-page.html', import.meta.url),
  'utf8',
);
const ADDRESS = 'https://atelier-aurore.fr/nous-rejoindre';

// Texts nobody would write by chance: where one of them turns up, something copied it.
const CV_TEXT = 'TEXTE-CV-9c1d';
const OFFER_TEXT = 'TEXTE-OFFRE-7f3a';
const PASTED_TEXT = 'TEXTE-ANNONCE-41aa';
const MODEL_TEXT = 'REPONSE-MODELE-b2e8';
const ECHO = 'ECHO-DEMANDE-55e0';

const taskOf = (system: string, prompt: string): string => {
  if (prompt.includes('<candidate_profile>')) return 'score_offers';
  if (system.includes('Tu lis le CV')) return 'deduce_profile';
  if (system.includes('Tu lis une offre')) return 'extract_offer_traits';
  if (system.includes('page carrières')) return 'extract_offers';
  return 'other';
};

const scripted = (name: 'local' | 'gemini'): LlmProvider => ({
  name,
  model: `${name}-test`,
  complete: ({ system, prompt }) => {
    asked.push({ provider: name, system, prompt });
    const answer = answerFor(taskOf(system, prompt), name);
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ text: answer, inputTokens: 100, outputTokens: 50 });
  },
});

const collect: AdapterDeps['fetch'] = (url) => {
  fetched.push(url);
  // Whatever the exact address of the board, the same board answers.
  const body = url.includes('greenhouse') ? pages['greenhouse'] : pages[url];
  return Promise.resolve({
    url,
    status: body === undefined ? 404 : 200,
    contentType: url.includes('boards.greenhouse.io') ? 'application/json' : 'text/html',
    body: body ?? '',
  });
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

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['data', 'analyst', 'sql'], contractTypes: ['cdi'] }],
  place: NANTERRE,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
};

const DEDUCTION = (label = 'Data analyst') =>
  JSON.stringify({
    periods: [{ start: '2022-09', end: '2024-08' }],
    targets: [{ label, keywords: ['sql'], contractTypes: ['cdi'], level: 'confirme' }],
  });

const greenhouse = (description: string) =>
  JSON.stringify({
    jobs: [
      {
        id: 1,
        title: 'Data Analyst',
        absolute_url: 'https://boards.greenhouse.io/atelieraurore/jobs/1',
        location: { name: 'Nanterre' },
        metadata: [],
        content: `&lt;p&gt;${description}&lt;/p&gt;`,
        updated_at: '2026-09-18T08:00:00Z',
      },
    ],
  });

const defaultAnswer = (task: string): string | Error => {
  if (task === 'score_offers') {
    return JSON.stringify({ offers: [{ ref: 1, score: 75, reason: `Proche des cibles. ${MODEL_TEXT}` }] });
  }
  if (task === 'deduce_profile') return DEDUCTION(`Poste ${MODEL_TEXT}`);
  if (task === 'extract_offer_traits')
    return JSON.stringify({ title: `Titre ${MODEL_TEXT}`, keywords: ['sql'] });
  return JSON.stringify({ offers: [] });
};

beforeEach(async () => {
  await truncateAll(database);
  logged = [];
  asked = [];
  fetched = [];
  pages = {};
  answerFor = (task) => defaultAnswer(task);
  context = createTestContext(database, {
    collect,
    aiProviders: { local: scripted('local'), gemini: scripted('gemini') },
    logWrite: (line) => logged.push(line),
  });
  alice = await registerUser(context.app, 'alice@example.com');
  await as(alice).put('/api/watch/criteria', CRITERIA).expect(200);
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('the model never chooses an address to reach (T-1015, ENF-COL-06)', () => {
  const generic = () =>
    as(alice)
      .post('/api/sites', { companyName: 'Atelier Aurore', adapter: 'generic', identifier: ADDRESS })
      .expect(201);

  const passAndCount = async () => {
    await as(alice).post('/api/sites/run', {}).expect(202);
    await context.queue.drain();
    return {
      sources: await database.db.select().from(watchedSites),
      discovered: await database.db.select().from(discoveredSources),
    };
  };

  it('[ENF-COL-06] makes no request to an address the model gives as the page of the offers, and creates no source', async () => {
    pages[ADDRESS] = CAREER_PAGE;
    answerFor = (task) =>
      task === 'extract_offers'
        ? JSON.stringify({ offers: [], careerPageUrl: 'https://evil.example/jobs' })
        : defaultAnswer(task);
    await generic();

    const { sources, discovered } = await passAndCount();

    expect(fetched).toEqual([ADDRESS]);
    expect(fetched.some((url) => url.includes('evil.example'))).toBe(false);
    expect(sources).toHaveLength(1);
    expect(discovered).toEqual([]);
  });

  it('[ENF-COL-06] sends the candidate to the page of the source, never to the address the model wrote for an offer', async () => {
    pages[ADDRESS] = CAREER_PAGE;
    answerFor = (task) =>
      task !== 'extract_offers'
        ? defaultAnswer(task)
        : JSON.stringify({
            offers: [
              {
                title: 'Data Analyst',
                url: 'https://evil.example/apply',
                location: 'Paris',
                contract: 'CDI',
                summary: 'Tableaux de bord.',
              },
            ],
            careerPageUrl: null,
          });
    await generic();

    const { sources } = await passAndCount();
    const offers = await as(alice).get('/api/offers').expect(200);

    expect(fetched.every((url) => url.startsWith('https://atelier-aurore.fr'))).toBe(true);
    expect(sources).toHaveLength(1);
    expect(JSON.stringify(offers.body)).not.toContain('evil.example');
  });

  it('[ENF-COL-06] reads no address the deduction or the extraction of a CV or an offer gives either', async () => {
    answerFor = (task) =>
      task === 'deduce_profile'
        ? JSON.stringify({
            periods: [],
            targets: [
              {
                label: 'Data analyst https://evil.example/collect',
                keywords: ['https://evil.example/kw'],
                contractTypes: ['cdi'],
                level: 'junior',
              },
            ],
          })
        : JSON.stringify({ title: 'Data analyst', keywords: ['https://evil.example/kw'] });
    const cv = buildTextPdf([
      ['Data Analyst', '09/2022 - 08/2024 Data Analyst chez Atelier Nova SQL Python Power BI'],
    ]);

    await as(alice)
      .post('/api/cv-types', { label: 'Data', file: cv.toString('base64') })
      .expect(202);
    await as(alice)
      .post('/api/chosen-offers', { level: 'junior', text: 'Offre de data analyst. '.repeat(20) })
      .expect(202);
    await context.queue.drain();

    expect(fetched).toEqual([]);
    expect(await database.db.select().from(watchedSites)).toEqual([]);
  });
});

describe('a pass leaves no text behind in the logs nor in the journals (T-1015, ENF-RGP-12)', () => {
  const JOURNALS = ['job_runs', 'job_run_counters', 'llm_calls'];
  const TEXTS = [CV_TEXT, OFFER_TEXT, PASTED_TEXT, MODEL_TEXT, ECHO];

  /** A whole day of the agent: a CV, a pasted offer, a pass over one board — with a model that fails and quotes. */
  const aDay = async () => {
    pages['greenhouse'] = greenhouse(`SQL. ${OFFER_TEXT}.`);
    // The local model fails and quotes what it was sent in its error, as a server may: the hosted ones answer.
    answerFor = (task, provider) => {
      if (provider === 'local') {
        const quoted = asked.at(-1);
        return new Error(`400 invalid JSON near: ${quoted?.prompt ?? ''} ${ECHO}`);
      }
      return defaultAnswer(task);
    };
    const cv = buildTextPdf([
      ['Data Analyst', `09/2022 - 08/2024 Data Analyst chez Atelier Nova ${CV_TEXT} SQL Python`],
    ]);
    await as(alice)
      .post('/api/cv-types', { label: 'Data', file: cv.toString('base64') })
      .expect(202);
    await as(alice)
      .post('/api/chosen-offers', {
        level: 'junior',
        text: `${PASTED_TEXT} Offre de data analyst. `.repeat(10),
      })
      .expect(202);
    await as(alice)
      .post('/api/sites', {
        companyName: 'Atelier Aurore',
        adapter: 'greenhouse',
        identifier: 'atelieraurore',
      })
      .expect(201);
    await as(alice).post('/api/sites/run', {}).expect(202);
    await context.queue.drain();
  };

  it('[ENF-RGP-12] writes no text of a CV, an offer, a prompt or an answer of the model in the log', async () => {
    await aDay();

    const log = logged.join('\n');
    expect(log).toContain('llm provider set aside');
    for (const text of TEXTS) expect(log, text).not.toContain(text);
  });

  it('[ENF-RGP-12] keeps in job_runs, job_run_counters and llm_calls only counters, states and names', async () => {
    await aDay();

    for (const text of TEXTS) expect(await tablesHolding(database, text, JOURNALS), text).toEqual([]);
  });

  it('[ENF-RGP-12] [ENF-RGP-14] keeps no text of the CV, of the pasted offer nor of the model’s answers in any table', async () => {
    await aDay();

    for (const text of [CV_TEXT, PASTED_TEXT, ECHO])
      expect(await tablesHolding(database, text), text).toEqual([]);
  });
});

describe('what a model is sent (T-1015, ENF-RGP-13)', () => {
  const RECRUITER = 'Écrivez à recrutement@atelier-aurore.example ou appelez le 01 23 45 67 89.';

  const sentByEveryone = async () => {
    pages['greenhouse'] = greenhouse(`SQL. ${RECRUITER}`);
    await as(alice)
      .post('/api/applications', {
        companyName: 'Société Secrète',
        jobTitle: 'Poste confidentiel',
        status: 'sent',
      })
      .expect(201);
    const cv = buildTextPdf([
      [
        'Camille Durand',
        'camille.durand@example.com | 06 12 34 56 78',
        '12 rue des Lilas, 69003 Lyon',
        '09/2022 - 08/2024 Data Analyst chez Atelier Nova',
        'SQL, Python, Power BI',
      ],
    ]);
    await as(alice)
      .post('/api/cv-types', { label: 'Data', file: cv.toString('base64') })
      .expect(202);
    await as(alice)
      .post('/api/chosen-offers', { level: 'junior', text: `Offre de data analyst. ${RECRUITER} `.repeat(8) })
      .expect(202);
    await as(alice)
      .post('/api/sites', {
        companyName: 'Atelier Aurore',
        adapter: 'greenhouse',
        identifier: 'atelieraurore',
      })
      .expect(201);
    await as(alice).post('/api/sites/run', {}).expect(202);
    await context.queue.drain();
    return asked;
  };

  it('[ENF-RGP-13] asks the deduction, the extraction and the scoring in turn — three kinds of prompt', async () => {
    const prompts = await sentByEveryone();

    expect(new Set(prompts.map((call) => taskOf(call.system, call.prompt)))).toEqual(
      new Set(['deduce_profile', 'extract_offer_traits', 'score_offers']),
    );
  });

  it('[ENF-RGP-13] sends no e-mail address and no phone number: not the candidate’s, not a recruiter’s', async () => {
    const prompts = await sentByEveryone();

    for (const { system, prompt } of prompts) {
      const sent = `${system}\n${prompt}`;
      expect(sent).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/u);
      expect(sent).not.toMatch(/\b0\d(?:[\s.]?\d{2}){4}\b/u);
    }
  });

  it('[ENF-RGP-13] sends nothing of the account, of the candidate’s name, of their applications nor of their messages', async () => {
    const prompts = await sentByEveryone();

    for (const { system, prompt } of prompts) {
      const sent = `${system}\n${prompt}`;
      expect(sent).not.toMatch(/alice|Camille Durand|Société Secrète|Poste confidentiel|12 rue des Lilas/iu);
    }
  });

  it('[ENF-RGP-13] still sends what the models need: the text of the CV, of the offers and the criteria', async () => {
    const prompts = await sentByEveryone();

    const byTask = (task: string) => prompts.filter((call) => taskOf(call.system, call.prompt) === task);
    expect(byTask('deduce_profile')[0]?.prompt).toContain('Data Analyst chez Atelier Nova');
    expect(byTask('extract_offer_traits')[0]?.prompt).toContain('Offre de data analyst.');
    expect(byTask('score_offers')[0]?.prompt).toContain('Data analyst');
  });
});
