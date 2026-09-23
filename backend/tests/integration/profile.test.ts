import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { candidateProfiles, users } from '../../src/db/schema.js';
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

// The anonymised profile of the fixtures: the real one is never read (CLAUDE.md).
const EXAMPLE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/profile.example.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

/**
 * The same profile as the API hands it back: the document is re-read through the schema, which fills the fields
 * added in v1.12 (EF-CVX-18, EF-CVX-19). A profile written before them keeps opening, with nothing invented.
 */
const STORED = {
  ...EXAMPLE,
  studyLevel: { level: null, isInProgress: false },
  cvSource: { ...(EXAMPLE['cvSource'] as Record<string, unknown>), certifications: [] },
};

const api = (cookie: string) => ({
  read: () => request(context.app).get('/api/profile').set('Cookie', cookie),
  save: (profile: unknown) =>
    request(context.app)
      .put('/api/profile')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send(profile as object),
});

beforeEach(async () => {
  await truncateAll(database);
  context = createTestContext(database);
  alice = await registerUser(context.app, 'alice@example.com');
});

afterAll(async () => {
  await database.close();
});

describe('GET/PUT /api/profile', () => {
  it('[EF-CVX-01] answers 404 while no profile was ever saved', async () => {
    const response = await api(alice).read();

    expect(response.status).toBe(404);
    expect((response.body as { error: string }).error).toContain('Aucun profil de référence');
  });

  it('[EF-CVX-02] [EF-CVX-01] saves the profile, then gives it back as it was written', async () => {
    expect((await api(alice).save(EXAMPLE)).status).toBe(204);

    const read = await api(alice).read();

    expect(read.status).toBe(200);
    expect(read.body).toEqual(STORED);
  });

  it('[EF-CVX-02] replaces the whole profile rather than merging it', async () => {
    await api(alice).save(EXAMPLE).expect(204);
    const shorter = {
      ...EXAMPLE,
      targets: [{ label: 'Data analyst', contractTypes: ['cdi'], keywords: ['data analyst'] }],
    };

    await api(alice).save(shorter).expect(204);

    expect((await api(alice).read()).body).toMatchObject({ targets: shorter.targets });
  });

  it.each([
    ['an email that is not one', { identity: { name: 'A', city: 'B', phone: 'C', email: 'pas-un-email' } }],
    ['no target at all', { targets: [] }],
    [
      'a contract type outside RG-09',
      { targets: [{ label: 'X', contractTypes: ['stage'], keywords: ['x'] }] },
    ],
    ['a field the schema does not know', { secretNotes: 'à ne pas garder' }],
  ])(
    '[EF-CVX-02] [ENF-SEC-04] refuses a profile with %s, and keeps the one already saved',
    async (_case, changes) => {
      await api(alice).save(EXAMPLE).expect(204);

      const refused = await api(alice).save({ ...EXAMPLE, ...changes });

      expect(refused.status).toBe(400);
      expect((refused.body as { details: unknown[] }).details.length).toBeGreaterThan(0);
      expect((await api(alice).read()).body).toEqual(STORED);
    },
  );

  it('[EF-CVX-01] answers 404 when what is stored no longer matches the schema', async () => {
    const [user] = await database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'alice@example.com'));
    // A document written outside the application: it must never reach a CV as it is (RG-12).
    await database.db
      .insert(candidateProfiles)
      .values({ userId: user?.id ?? 0, document: { identity: {} }, updatedAt: new Date() });

    const response = await api(alice).read();

    expect(response.status).toBe(404);
    expect((response.body as { error: string }).error).toContain('ne correspond plus');
  });

  it('[EF-CVX-18] [EF-CVX-19] stores the level of study and the certifications, and hands them back', async () => {
    const complete = {
      ...EXAMPLE,
      studyLevel: { level: 'bac_5', isInProgress: true },
      cvSource: {
        ...(EXAMPLE['cvSource'] as Record<string, unknown>),
        certifications: [{ name: 'Tableau Desktop Specialist', issuer: 'Tableau', year: 2025 }],
      },
    };

    await api(alice).save(complete).expect(204);

    expect((await api(alice).read()).body).toMatchObject({
      studyLevel: { level: 'bac_5', isInProgress: true },
      cvSource: { certifications: [{ name: 'Tableau Desktop Specialist', issuer: 'Tableau', year: 2025 }] },
    });
  });

  it.each([
    ['a level outside RG-18', { studyLevel: { level: 'bac_4' } }],
    [
      'a certification without a name',
      { cvSource: { ...(EXAMPLE['cvSource'] as object), certifications: [{ issuer: 'Tableau' }] } },
    ],
  ])('[EF-CVX-18] [EF-CVX-19] [ENF-SEC-04] refuses %s, and keeps the profile as it was', async (_case, changes) => {
    await api(alice).save(EXAMPLE).expect(204);

    const refused = await api(alice).save({ ...EXAMPLE, ...changes });

    expect(refused.status).toBe(400);
    expect((await api(alice).read()).body).toEqual(STORED);
  });

  it('[EF-AUT-06] keeps the profile of each account apart', async () => {
    const bob = await registerUser(context.app, 'bob@example.com');
    await api(alice).save(EXAMPLE).expect(204);

    expect((await api(bob).read()).status).toBe(404);
    await api(bob)
      .save({ ...EXAMPLE, identity: { ...(EXAMPLE['identity'] as object), name: 'Bob DUPONT' } })
      .expect(204);

    expect((await api(alice).read()).body).toMatchObject({ identity: { name: 'Alex MARTIN' } });
  });

  it('[EF-AUT-05] refuses to read or write a profile without a session', async () => {
    expect((await request(context.app).get('/api/profile')).status).toBe(401);
    expect(
      (await request(context.app).put('/api/profile').set('Content-Type', 'application/json').send(EXAMPLE))
        .status,
    ).toBe(401);
  });

  it('[ENF-SEC-12] refuses a write that is not declared as JSON', async () => {
    const response = await request(context.app)
      .put('/api/profile')
      .set('Cookie', alice)
      .set('Content-Type', 'text/plain')
      .send('{}');

    expect(response.status).toBe(415);
  });
});
