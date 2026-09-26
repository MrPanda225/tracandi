import request from 'supertest';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jobRuns } from '../../src/db/schema.js';
import { CV_MAX_BYTES, NOT_A_PDF } from '../../src/modules/cvWorkshop/upload.js';
import type { LlmProvider } from '../../src/llm/types.js';
import { buildLockedPdf, buildTextPdf, FICTITIOUS_CV_LINES } from '../fixtures/cv/pdf.js';
import { createTestContext, openTestDatabase, registerUser, type TestContext, truncateAll } from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;

const DIAGNOSIS = readFileSync(new URL('../fixtures/llm/diagnose_cv.json', import.meta.url), 'utf8');
const OFFER = 'Data Analyst en CDI à Lyon. Vous maîtrisez SQL, Python, dbt et Airflow. '.repeat(4);

/** The AI of the test: it answers the diagnostic of the fixture, and remembers what it was sent. */
const prompts: string[] = [];
const diagnosingAi: LlmProvider = {
  name: 'gemini',
  model: 'gemini-test',
  complete: (llmRequest) => {
    prompts.push(llmRequest.prompt);
    return Promise.resolve({ text: DIAGNOSIS, inputTokens: 900, outputTokens: 300 });
  },
};

const startAnalysis = (cookie: string, body: object) =>
  request(context.app)
    .post('/api/cv-workshop/analyses')
    .set('Cookie', cookie)
    .set('Content-Type', 'application/json')
    .send(body);

const cvBase64 = (): string => buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64');
const analysisOf = (file: string) => ({ file, offer: OFFER });

beforeEach(async () => {
  await truncateAll(database);
  prompts.length = 0;
  context = createTestContext(database, { aiProviders: { gemini: diagnosingAi } });
  alice = await registerUser(context.app, 'alice@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/cv-workshop/analyses', () => {
  it('[EF-CVX-32] answers at once with the run, then reads the CV in the queue', async () => {
    const started = await startAnalysis(alice, analysisOf(cvBase64()));

    expect(started.status).toBe(202);
    const { runId } = started.body as { runId: number };
    await context.queue.drain();
    const result = await request(context.app).get(`/api/cv-workshop/analyses/${String(runId)}`).set('Cookie', alice);

    expect(result.status).toBe(200);
    const { reading } = result.body as { reading: { text: string; contacts: { phones: string[] } } };
    expect(reading.text).toContain('Data Analyst - Atelier Nova');
    // ENF-RGP-07: what the AI will receive carries no contact detail; they are handed back apart.
    expect(reading.text).not.toContain('06 12 34 56 78');
    expect(reading.contacts.phones).toEqual(['06 12 34 56 78']);
  });

  it('[EF-CVX-24] [RG-23] [EF-CVX-27] diagnoses the CV against the offer, without its contact details', async () => {
    const started = await startAnalysis(alice, analysisOf(cvBase64()));
    await context.queue.drain();

    const result = await request(context.app)
      .get(`/api/cv-workshop/analyses/${String((started.body as { runId: number }).runId)}`)
      .set('Cookie', alice);
    expect((result.body as { diagnosis: unknown }).diagnosis).toMatchObject({
      overallScore: 70,
      weakDimensions: ['techStack'],
      missingSkills: ['dbt', 'Airflow'],
    });
    expect(prompts[0]).toContain('Atelier Nova');
    expect(prompts[0]).not.toMatch(/camille\.durand@example\.com|06 12 34 56 78/);
  });

  it('[EF-CVX-23] refuses an offer shorter than 200 characters, saying why', async () => {
    const response = await startAnalysis(alice, { file: cvBase64(), offer: 'Data Analyst, SQL.' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('collez le texte entier de l’annonce');
  });

  it('[EF-CVX-33] accepts five analyses a day, then refuses the sixth', async () => {
    for (let index = 0; index < 5; index += 1) {
      expect((await startAnalysis(alice, analysisOf(cvBase64()))).status).toBe(202);
    }
    await context.queue.drain();

    const sixth = await startAnalysis(alice, analysisOf(cvBase64()));

    expect(sixth.status).toBe(429);
    context.clock.advanceDays(1);
    expect((await startAnalysis(alice, analysisOf(cvBase64()))).status).toBe(202);
    await context.queue.drain();
  });

  it('[ENF-RGP-06] journals the run with its counters only, nothing of the CV', async () => {
    await startAnalysis(alice, analysisOf(cvBase64()));
    await context.queue.drain();

    const runs = await database.db
      .select({ job: jobRuns.job, outcome: jobRuns.outcome, error: jobRuns.error })
      .from(jobRuns);
    expect(runs).toEqual([{ job: 'cv_analysis', outcome: 'success', error: null }]);
  });

  it('[EF-CVX-34] ends the run in failure with the reason, for a locked PDF', async () => {
    await startAnalysis(alice, analysisOf(buildLockedPdf(['Secret']).toString('base64')));
    await context.queue.drain();

    const [run] = await database.db.select({ outcome: jobRuns.outcome, error: jobRuns.error }).from(jobRuns);
    expect(run?.outcome).toBe('failure');
    expect(run?.error).toMatch(/protégé par un mot de passe/);
  });

  it('[EF-CVX-21] refuses a CV of more than 5 MB, and queues nothing', async () => {
    const tooLarge = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(CV_MAX_BYTES, 0x20)]);

    const response = await startAnalysis(alice, analysisOf(tooLarge.toString('base64')));

    expect(response.status).toBe(413);
    expect(await database.db.select().from(jobRuns)).toEqual([]);
  });

  it('[EF-CVX-21] refuses a DOCX', async () => {
    const docx = Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(100, 0)]);

    const response = await startAnalysis(alice, analysisOf(docx.toString('base64')));

    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toBe(NOT_A_PDF);
  });

  it('[ENF-SEC-04] refuses a body without the file, or with other fields', async () => {
    expect((await startAnalysis(alice, { offer: OFFER })).status).toBe(400);
    expect((await startAnalysis(alice, { ...analysisOf(cvBase64()), name: 'cv.pdf' })).status).toBe(400);
  });

  it('[ENF-SEC-12] keeps the 100 kB limit on every other route', async () => {
    const response = await request(context.app)
      .post('/api/applications')
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({ companyName: 'A'.repeat(200_000) });

    expect(response.status).toBe(413);
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    expect((await startAnalysis('', analysisOf(cvBase64()))).status).toBe(401);
  });
});

describe('GET /api/cv-workshop/analyses/:id', () => {
  it('[EF-AUT-06] answers 404 for the analysis of another account', async () => {
    const started = await startAnalysis(alice, analysisOf(cvBase64()));
    await context.queue.drain();
    const bob = await registerUser(context.app, 'bob@example.com');

    const response = await request(context.app)
      .get(`/api/cv-workshop/analyses/${String((started.body as { runId: number }).runId)}`)
      .set('Cookie', bob);

    expect(response.status).toBe(404);
  });

  it('[ENF-RGP-06] answers 404 for an analysis it does not hold', async () => {
    expect((await request(context.app).get('/api/cv-workshop/analyses/999').set('Cookie', alice)).status).toBe(404);
  });

  it('[ENF-SEC-04] refuses an identifier that is not a number', async () => {
    expect((await request(context.app).get('/api/cv-workshop/analyses/abc').set('Cookie', alice)).status).toBe(400);
  });
});

