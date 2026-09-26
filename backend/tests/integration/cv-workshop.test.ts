import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { jobRuns } from '../../src/db/schema.js';
import { CV_MAX_BYTES } from '../../src/modules/cvWorkshop/upload.js';
import { buildLockedPdf, buildTextPdf, FICTITIOUS_CV_LINES } from '../fixtures/cv/pdf.js';
import { createTestContext, openTestDatabase, registerUser, type TestContext, truncateAll } from './context.js';

const database = openTestDatabase();
let context: TestContext;
let alice: string;

const startAnalysis = (cookie: string, body: object) =>
  request(context.app)
    .post('/api/cv-workshop/analyses')
    .set('Cookie', cookie)
    .set('Content-Type', 'application/json')
    .send(body);

const cvBase64 = (): string => buildTextPdf([[...FICTITIOUS_CV_LINES]]).toString('base64');

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/cv-workshop/analyses', () => {
  it('[EF-CVX-32] answers at once with the run, then reads the CV in the queue', async () => {
    const started = await startAnalysis(alice, { file: cvBase64() });

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

  it('[ENF-RGP-06] journals the run with its counters only, nothing of the CV', async () => {
    await startAnalysis(alice, { file: cvBase64() });
    await context.queue.drain();

    const runs = await database.db
      .select({ job: jobRuns.job, outcome: jobRuns.outcome, error: jobRuns.error })
      .from(jobRuns);
    expect(runs).toEqual([{ job: 'cv_analysis', outcome: 'success', error: null }]);
  });

  it('[EF-CVX-34] ends the run in failure with the reason, for a locked PDF', async () => {
    await startAnalysis(alice, { file: buildLockedPdf(['Secret']).toString('base64') });
    await context.queue.drain();

    const [run] = await database.db.select({ outcome: jobRuns.outcome, error: jobRuns.error }).from(jobRuns);
    expect(run?.outcome).toBe('failure');
    expect(run?.error).toMatch(/protégé par un mot de passe/);
  });

  it('[EF-CVX-21] refuses a CV of more than 5 MB, and queues nothing', async () => {
    const tooLarge = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(CV_MAX_BYTES, 0x20)]);

    const response = await startAnalysis(alice, { file: tooLarge.toString('base64') });

    expect(response.status).toBe(413);
    expect(await database.db.select().from(jobRuns)).toEqual([]);
  });

  it('[EF-CVX-21] refuses a DOCX', async () => {
    const docx = Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(100, 0)]);

    const response = await startAnalysis(alice, { file: docx.toString('base64') });

    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toBe('Seul un CV au format PDF est accepté.');
  });

  it('[ENF-SEC-04] refuses a body without the file, or with other fields', async () => {
    expect((await startAnalysis(alice, {})).status).toBe(400);
    expect((await startAnalysis(alice, { file: cvBase64(), name: 'cv.pdf' })).status).toBe(400);
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
    expect((await startAnalysis('', { file: cvBase64() })).status).toBe(401);
  });
});

describe('GET /api/cv-workshop/analyses/:id', () => {
  it('[EF-AUT-06] answers 404 for the analysis of another account', async () => {
    const started = await startAnalysis(alice, { file: cvBase64() });
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

