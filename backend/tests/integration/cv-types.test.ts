import request from 'supertest';
import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cvTypes, jobRuns, users } from '../../src/db/schema.js';
import type { PdfOcr } from '../../src/modules/cvWorkshop/ocr.js';
import { CV_MAX_BYTES } from '../../src/modules/cvWorkshop/upload.js';
import type { LlmProvider } from '../../src/llm/types.js';
import {
  blankImage,
  buildLockedPdf,
  buildScannedPdf,
  buildTextPdf,
  FICTITIOUS_CV_LINES,
} from '../fixtures/cv/pdf.js';
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
let aiCalls: number;

/** An AI that counts what it is asked: reading a CV type must not reach it (EF-CVX-40). */
const ai: LlmProvider = {
  name: 'gemini',
  model: 'test',
  complete: () => {
    aiCalls += 1;
    return Promise.reject(new Error('No AI provider must be called to read a CV type'));
  },
};

/** The OCR of the test: it reads a scanned page as the text of a short CV. */
const ocrPages = vi.fn<PdfOcr['readPages']>();

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

/** What the queue says of the run an import or a replacement started, once it is over. */
const outcomeOf = async (email: string, response: request.Response) => {
  await context.queue.drain();
  return context.queue.stateOf(await userIdOf(email), (response.body as { runId: number }).runId);
};

const importCv = (cookie: string, label: string, file: string = cvBase64()) =>
  as(cookie).post('/api/cv-types', { label, file });

const listOf = async (cookie: string) =>
  (await as(cookie).get('/api/cv-types').expect(200)).body as {
    items: { id: number; label: string; years: number | null; level: string | null }[];
    maxItems: number;
  };

beforeEach(async () => {
  await truncateAll(database);
  aiCalls = 0;
  ocrPages.mockReset();
  ocrPages.mockResolvedValue([FICTITIOUS_CV_LINES.join('\n')]);
  context = createTestContext(database, { aiProviders: { gemini: ai }, ocr: { readPages: ocrPages } });
  alice = await registerUser(context.app, 'alice@example.com');
  bob = await registerUser(context.app, 'bob@example.com');
});

afterAll(async () => {
  await context.queue.drain();
  await database.close();
});

describe('importing a CV type (T-1009, EF-CVX-39)', () => {
  it('[EF-CVX-43] answers at once with the run, then reads the CV in the queue and lists it', async () => {
    const response = await importCv(alice, 'Data analyst');

    expect(response.status).toBe(202);
    expect(await outcomeOf('alice@example.com', response)).toMatchObject({
      outcome: 'success',
      job: 'profile_deduction',
      counters: { cv_steps_done: 1 },
    });
    const { items, maxItems } = await listOf(alice);
    expect(items.map((item) => item.label)).toEqual(['Data analyst']);
    expect(maxItems).toBe(4);
  });

  it('[EF-CVX-39] accepts four CV types and refuses a fifth, in French, whatever the order they were read in', async () => {
    for (const label of ['Data analyst', 'Data engineer', 'Python', 'Data scientist']) {
      await outcomeOf('alice@example.com', await importCv(alice, label).expect(202));
    }

    const fifth = await importCv(alice, 'Un cinquième');

    expect(fifth.status).toBe(409);
    expect(JSON.stringify(fifth.body)).toContain('4 CV types');
    expect((await listOf(alice)).items).toHaveLength(4);
  });

  it('[EF-CVX-39] counts the imports still waiting in the queue: a fifth is refused at once, not after the others', async () => {
    const accepted = await Promise.all(
      ['Un', 'Deux', 'Trois', 'Quatre'].map((label) => importCv(alice, label).then((r) => r.status)),
    );

    const fifth = await importCv(alice, 'Cinq');
    await context.queue.drain();

    expect(accepted).toEqual([202, 202, 202, 202]);
    expect(fifth.status).toBe(409);
    expect((await listOf(alice)).items).toHaveLength(4);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['81 characters', 'x'.repeat(81)],
  ])('[EF-CVX-39] refuses a label that is %s, with a 400', async (_name, label) => {
    const response = await importCv(alice, label);

    expect(response.status).toBe(400);
    expect(await database.db.select().from(jobRuns)).toEqual([]);
  });

  it('[EF-CVX-39] accepts a label of 80 characters and keeps it trimmed', async () => {
    await importCv(alice, `  ${'x'.repeat(80)}  `).expect(202);
    await context.queue.drain();

    expect((await listOf(alice)).items.map((item) => item.label)).toEqual(['x'.repeat(80)]);
  });

  it('[EF-CVX-39] keeps the CV types of each candidate apart: Bob sees none of Alice’s and has his own four', async () => {
    await importCv(alice, 'Data analyst').expect(202);
    await context.queue.drain();

    expect((await listOf(bob)).items).toEqual([]);
    await importCv(bob, 'Data analyst').expect(202);
    await context.queue.drain();
    expect((await listOf(bob)).items).toHaveLength(1);
  });

  it('[EF-AUT-06] asks for a session', async () => {
    await request(context.app).get('/api/cv-types').expect(401);
    await request(context.app).post('/api/cv-types').send({ label: 'x', file: cvBase64() }).expect(401);
    await request(context.app).delete('/api/cv-types/1').set('Content-Type', 'application/json').expect(401);
  });
});

describe('reading a CV type with the controls of the CV workshop (T-1009, EF-CVX-40)', () => {
  it('[EF-CVX-40] refuses a DOCX at once, with no run, no row and no AI call', async () => {
    const docx = Buffer.concat([Buffer.from('PK\u0003\u0004', 'latin1'), Buffer.alloc(100, 0)]);

    const response = await importCv(alice, 'Data analyst', docx.toString('base64'));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('PDF');
    expect(await database.db.select().from(jobRuns)).toEqual([]);
    expect(await database.db.select().from(cvTypes)).toEqual([]);
    expect(aiCalls).toBe(0);
  });

  it('[EF-CVX-40] refuses a file of more than 5 MB with a 413', async () => {
    const tooLarge = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(CV_MAX_BYTES, 0x20)]);

    const response = await importCv(alice, 'Data analyst', tooLarge.toString('base64'));

    expect(response.status).toBe(413);
    expect(await database.db.select().from(jobRuns)).toEqual([]);
  });

  it('[EF-CVX-34] [EF-CVX-40] refuses a PDF locked by a password, saying so, with no row and no AI call', async () => {
    const response = await importCv(alice, 'Data analyst', buildLockedPdf(['Secret']).toString('base64'));
    expect(response.status).toBe(202);

    const state = await outcomeOf('alice@example.com', response);

    expect(state).toMatchObject({ outcome: 'failure' });
    expect(state?.error).toMatch(/protégé par un mot de passe/u);
    expect(await database.db.select().from(cvTypes)).toEqual([]);
    expect(aiCalls).toBe(0);
  });

  it('[EF-CVX-22] [EF-CVX-40] reads a scanned page by OCR on the server, without any AI call', async () => {
    const scanned = buildScannedPdf([blankImage()]).toString('base64');

    const response = await importCv(alice, 'Scan', scanned);
    const state = await outcomeOf('alice@example.com', response);

    expect(ocrPages).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ outcome: 'success', counters: { cv_pages_ocr: 1 } });
    expect((await listOf(alice)).items.map((item) => item.label)).toEqual(['Scan']);
    expect(aiCalls).toBe(0);
  });

  it('[EF-CVX-40] refuses a PDF that holds no text at all, even read by OCR', async () => {
    ocrPages.mockResolvedValue(['']);

    const response = await importCv(alice, 'Vide', buildScannedPdf([blankImage()]).toString('base64'));
    const state = await outcomeOf('alice@example.com', response);

    expect(state).toMatchObject({ outcome: 'failure' });
    expect(state?.error).toMatch(/aucun texte/u);
    expect(await database.db.select().from(cvTypes)).toEqual([]);
  });
});

describe('replacing and deleting a CV type (T-1009, EF-CVX-41, EF-CVX-42)', () => {
  const importOne = async (cookie: string, email: string, label: string) => {
    await outcomeOf(email, await importCv(cookie, label).expect(202));
    const { items } = await listOf(cookie);
    return items.find((item) => item.label === label)?.id ?? 0;
  };

  it('[EF-CVX-41] replaces the file of a CV type: same label and same place, read again', async () => {
    const id = await importOne(alice, 'alice@example.com', 'Data analyst');
    const [before] = await database.db.select().from(cvTypes);

    context.clock.advanceDays(1);
    const response = await as(alice).put(`/api/cv-types/${String(id)}`, { file: cvBase64() });
    const state = await outcomeOf('alice@example.com', response);

    expect(response.status).toBe(202);
    expect(state).toMatchObject({ outcome: 'success', job: 'profile_deduction' });
    const rows = await database.db.select().from(cvTypes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, label: 'Data analyst' });
    expect(rows[0]?.updatedAt.getTime()).toBeGreaterThan(before?.updatedAt.getTime() ?? 0);
  });

  it('[EF-CVX-41] keeps the old CV type untouched when the new file cannot be read', async () => {
    const id = await importOne(alice, 'alice@example.com', 'Data analyst');
    const [before] = await database.db.select().from(cvTypes);

    const response = await as(alice).put(`/api/cv-types/${String(id)}`, {
      file: buildLockedPdf(['Secret']).toString('base64'),
    });
    const state = await outcomeOf('alice@example.com', response);

    expect(state).toMatchObject({ outcome: 'failure' });
    expect(await database.db.select().from(cvTypes)).toEqual([before]);
  });

  it('[EF-CVX-41] [EF-AUT-06] knows no CV type of another account, and one that is gone', async () => {
    const id = await importOne(alice, 'alice@example.com', 'Data analyst');

    await as(bob)
      .put(`/api/cv-types/${String(id)}`, { file: cvBase64() })
      .expect(404);
    await as(bob)
      .delete(`/api/cv-types/${String(id)}`)
      .expect(404);
    await as(alice).put('/api/cv-types/999999', { file: cvBase64() }).expect(404);
    expect(await database.db.select().from(cvTypes)).toHaveLength(1);
  });

  it('[EF-CVX-42] [ENF-RGP-02] deletes a CV type: not a single row left for it, the others untouched', async () => {
    const first = await importOne(alice, 'alice@example.com', 'Data analyst');
    await importOne(alice, 'alice@example.com', 'Python');

    await as(alice)
      .delete(`/api/cv-types/${String(first)}`)
      .expect(204);

    expect((await listOf(alice)).items.map((item) => item.label)).toEqual(['Python']);
    const rows = await database.db.select().from(cvTypes).orderBy(asc(cvTypes.id));
    expect(rows.map((row) => row.label)).toEqual(['Python']);
  });

  it('[EF-CVX-42] frees the place of a deleted CV type for a new one', async () => {
    for (const label of ['Un', 'Deux', 'Trois', 'Quatre']) {
      await importOne(alice, 'alice@example.com', label);
    }
    const [first] = (await listOf(alice)).items;

    await as(alice)
      .delete(`/api/cv-types/${String(first?.id)}`)
      .expect(204);
    await importCv(alice, 'Cinq').expect(202);
    await context.queue.drain();

    expect((await listOf(alice)).items).toHaveLength(4);
  });
});

describe('what is kept of a CV type (T-1009, ENF-RGP-14)', () => {
  it('[ENF-RGP-14] keeps the label, the years, the level and the dates — and the text of the CV in no table at all', async () => {
    await importCv(alice, 'Data analyst').expect(202);
    await context.queue.drain();

    const [row] = await database.db.select().from(cvTypes);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['createdAt', 'id', 'label', 'level', 'updatedAt', 'userId', 'years'].sort(),
    );
    // Neither a line of the CV, nor its contact details, nor the file itself, in any table, whatever the column.
    for (const needle of [
      'Atelier Nova',
      'Tableaux de bord Power BI',
      '06 12 34 56 78',
      'camille.durand',
      '%PDF-',
    ]) {
      expect(await tablesHolding(database, needle), needle).toEqual([]);
    }
  });

  it('[ENF-RGP-12] journals the run with counters and states only', async () => {
    const response = await importCv(alice, 'Data analyst');
    await outcomeOf('alice@example.com', response);

    const runs = await database.db.select().from(jobRuns);
    expect(runs).toHaveLength(1);
    expect(JSON.stringify(runs)).not.toContain('Atelier Nova');
  });

  it('[ENF-MAI-07] answers nothing on a deployment without the watch', async () => {
    const without = createTestContext(database, { features: new Set() });
    const cookie = await registerUser(without.app, 'carol@example.com');

    expect((await request(without.app).get('/api/cv-types').set('Cookie', cookie)).status).toBe(404);
    expect(
      (
        await request(without.app)
          .post('/api/cv-types')
          .set('Cookie', cookie)
          .send({ label: 'x', file: cvBase64() })
      ).status,
    ).toBe(404);
  });
});
