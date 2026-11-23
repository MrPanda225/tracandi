import { readFileSync } from 'node:fs';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applicationStatusHistory, applications, companies } from '../../src/db/schema.js';
import { CSV_MAX_BYTES } from '../../src/modules/applications/csvImport.js';
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
let bob: string;

// A fictitious tracking sheet of 20 applications, exported from Google Sheets (comma, CRLF, quoted fields).
const GOOGLE_SHEET = readFileSync(new URL('../fixtures/csv/google-sheets-20.csv', import.meta.url));
const SHEET_MAPPING = { company: 0, jobTitle: 1, link: 2, appliedAt: 3, status: 4, notes: 5 };

const base64 = (content: string | Buffer) => Buffer.from(content).toString('base64');
const post = (cookie: string, path: string, body: object) =>
  request(context.app).post(path).set('Cookie', cookie).set('Content-Type', 'application/json').send(body);
const preview = (cookie: string, file: string) => post(cookie, '/api/applications/import/preview', { file });
const importFile = (cookie: string, file: string, mapping: object = SHEET_MAPPING) =>
  post(cookie, '/api/applications/import', { file, mapping });

const countApplications = async (): Promise<number> => {
  const [row] = await database.db.select({ total: count() }).from(applications);
  return row?.total ?? 0;
};

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.test');
  bob = await registerUser(context.app, 'bob@example.test');
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/applications/import/preview', () => {
  it('[EF-CAN-23] returns the header, the first 5 rows and a mapping proposed from the column names', async () => {
    const response = await preview(alice, base64(GOOGLE_SHEET));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      delimiter: ',',
      headers: ['Entreprise', 'Poste', 'Lien', 'Date de candidature', 'Statut', 'Notes'],
      totalRows: 20,
      mapping: SHEET_MAPPING,
    });
    const { rows } = response.body as { rows: string[][] };
    expect(rows).toHaveLength(5);
    expect(rows[2]?.[5]).toBe('Entretien le 12, avec "Mme Martin"');
    expect(rows[4]?.[5]).toBe('Relance prévue,\npuis appel');
    expect(await countApplications()).toBe(0);
  });

  it('[EF-CAN-23] refuses a file larger than 1 MB with 413', async () => {
    const tooLarge = `Entreprise\n${'a'.repeat(CSV_MAX_BYTES)}`;
    expect((await preview(alice, base64(tooLarge))).status).toBe(413);
    // Larger than the body limit itself: refused by the parser, before any decoding.
    expect((await preview(alice, 'A'.repeat(2 * CSV_MAX_BYTES))).status).toBe(413);
  });

  it('[EF-CAN-23] refuses a file that is not text with 415', async () => {
    const response = await preview(alice, base64(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00, 0xff])));
    expect(response.status).toBe(415);
    expect((response.body as { error: string }).error).toMatch(/CSV/u);
  });

  it('[EF-CAN-23] refuses an invalid CSV with 400 naming its line, and a missing file with 400', async () => {
    const response = await preview(alice, base64('Entreprise,Notes\nNova,"jamais fermé\n'));
    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toMatch(/ligne 2/iu);
    expect((await post(alice, '/api/applications/import/preview', {})).status).toBe(400);
  });

  it('[EF-AUT-05] requires a session', async () => {
    const response = await request(context.app)
      .post('/api/applications/import/preview')
      .set('Content-Type', 'application/json')
      .send({ file: base64(GOOGLE_SHEET) });
    expect(response.status).toBe(401);
  });
});

describe('POST /api/applications/import', () => {
  it('[EF-CAN-23] creates the 20 applications of a Google Sheets export, then none when it is imported again', async () => {
    const first = await importFile(alice, base64(GOOGLE_SHEET));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ created: 20, duplicates: 0, rejected: [] });
    expect(await countApplications()).toBe(20);

    const second = await importFile(alice, base64(GOOGLE_SHEET));
    expect(second.body).toEqual({ created: 0, duplicates: 20, rejected: [] });
    expect(await countApplications()).toBe(20);
  });

  it('[EF-CAN-23] stores each field, the link opening the notes, with one status history entry each', async () => {
    await importFile(alice, base64(GOOGLE_SHEET));
    const list = await request(context.app).get('/api/applications?sort=company&order=asc').set('Cookie', alice);
    const items = (list.body as { items: { company: { name: string }; jobTitle: string; status: string; notes: string | null; appliedAt: string }[] }).items;
    expect(items[0]).toMatchObject({
      company: { name: 'Atelier Nova' },
      jobTitle: 'Data analyst H/F',
      status: 'sent',
      notes: 'Lien : https://emplois.example/nova/12',
      // 2 September 2026, midnight in Paris.
      appliedAt: '2026-09-01T22:00:00.000Z',
    });
    expect(items.find((item) => item.company.name === 'Cobalt Conseil')).toMatchObject({
      status: 'interview',
      notes: 'Lien : https://cobalt.example/offres/7\n\nEntretien le 12, avec "Mme Martin"',
    });
    const [history] = await database.db.select({ total: count() }).from(applicationStatusHistory);
    expect(history?.total).toBe(20);
  });

  it('[EF-CAN-23] ignores a row designating an existing application by its company (RG-26) and job title (RG-25)', async () => {
    const created = await post(alice, '/api/applications', {
      companyName: 'Capgemini',
      jobTitle: 'Data analyst',
      status: 'sent',
    });
    expect(created.status).toBe(201);
    const csv = [
      'Entreprise;Poste',
      'CAPGEMINI SE;Data Analyst (H/F) - CDI',
      'Capgemini France;Data engineer',
      'Capgemini;Data engineer',
    ].join('\n');
    const response = await importFile(alice, base64(csv), { company: 0, jobTitle: 1 });
    expect(response.body).toEqual({ created: 1, duplicates: 2, rejected: [] });
    // RG-26: the new application joins the existing company instead of creating « Capgemini France ».
    const names = await database.db.select({ name: companies.name }).from(companies);
    expect(names.map((company) => company.name)).toEqual(['Capgemini']);
  });

  it('[EF-CAN-23] refuses the invalid rows by line and reason, and creates the others', async () => {
    const csv = [
      'Entreprise,Poste,Date,Statut',
      'Nova,Analyste,15/09/2026,Envoyée',
      ',Sans entreprise,15/09/2026,Envoyée',
      'Beta,Analyste,"31/02/2026",Envoyée',
      '',
      'Gamma,Analyste,15/09/2026,En cours',
    ].join('\r\n');
    const response = await importFile(alice, base64(csv), { company: 0, jobTitle: 1, appliedAt: 2, status: 3 });
    expect(response.status).toBe(200);
    const result = response.body as { created: number; duplicates: number; rejected: { line: number; reason: string }[] };
    expect(result.created).toBe(1);
    expect(result.rejected.map((row) => row.line)).toEqual([3, 4, 6]);
    expect(result.rejected[0]?.reason).toMatch(/entreprise/iu);
    expect(result.rejected[1]?.reason).toMatch(/31\/02\/2026/u);
    expect(result.rejected[2]?.reason).toMatch(/En cours/u);
  });

  it('[EF-CAN-23] keeps the imports of each user apart (EF-AUT-06)', async () => {
    await importFile(alice, base64(GOOGLE_SHEET));
    const response = await importFile(bob, base64(GOOGLE_SHEET));
    expect(response.body).toMatchObject({ created: 20, duplicates: 0 });
    const [bobCompanies] = await database.db
      .select({ total: count() })
      .from(companies)
      .where(eq(companies.name, 'Atelier Nova'));
    expect(bobCompanies?.total).toBe(2);
  });

  it('[EF-CAN-23] refuses a mapping without company, giving one column twice or naming a missing column (400)', async () => {
    const file = base64(GOOGLE_SHEET);
    const cases = [
      { jobTitle: 1 },
      { company: 0, jobTitle: 0 },
      { company: 0, notes: 9 },
    ];
    for (const mapping of cases) {
      const response = await importFile(alice, file, mapping);
      expect(response.status).toBe(400);
      expect((response.body as { details: { path: string }[] }).details[0]?.path).toMatch(/^body\.mapping/u);
    }
    expect(await countApplications()).toBe(0);
  });

  it('[EF-CAN-23] refuses a file larger than 1 MB with 413 and stores nothing', async () => {
    const response = await importFile(alice, base64(`Entreprise\n${'a'.repeat(CSV_MAX_BYTES)}`), { company: 0 });
    expect(response.status).toBe(413);
    expect(await countApplications()).toBe(0);
  });
});
