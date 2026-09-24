import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applications, companies, users } from '../../src/db/schema.js';
import { encryptSecret } from '../../src/lib/crypto.js';
import type { LlmProvider, LlmRequest } from '../../src/llm/types.js';
import { createGmailMailbox } from '../../src/modules/emails/mailbox.js';
import { saveGmailAccount } from '../../src/modules/emails/repository.js';
import { createFakeGmail, type FakeGmail } from '../fixtures/emails/fakeGmail.js';
import { MCDONALDS_ACKNOWLEDGEMENT, SENT_APPLICATION } from '../fixtures/emails/messages.js';
import { createScriptedClassifier } from '../fixtures/llm/classifications.js';
import { createTestContext, openTestDatabase, registerUser, type TestContext, truncateAll } from './context.js';

const FOLLOW_UP = JSON.parse(
  readFileSync(new URL('../fixtures/llm/write_follow_up.json', import.meta.url), 'utf8'),
) as { body: string };
const SYNC_TIME = new Date('2026-09-22T10:00:00.000Z');

const database = openTestDatabase();
let context: TestContext;
let gmail: FakeGmail;
let alice: string;
let aliceId: number;
let writerRequests: LlmRequest[];
let writtenBody: string;

/** One provider for both tasks: the recorded classifications, and the follow-up of the fixture (or `writtenBody`). */
const scriptedProvider = (): LlmProvider => {
  const classifier = createScriptedClassifier('gemini').provider;
  return {
    name: 'gemini',
    model: 'gemini-test',
    complete: (llmRequest) => {
      if (!llmRequest.system.includes('e-mail de relance')) return classifier.complete(llmRequest);
      writerRequests.push(llmRequest);
      return Promise.resolve({ text: JSON.stringify({ body: writtenBody }), inputTokens: 300, outputTokens: 200 });
    },
  };
};

const setUp = async (messages: readonly gmail_v1.Schema$Message[]) => {
  gmail = createFakeGmail(messages);
  writerRequests = [];
  writtenBody = FOLLOW_UP.body;
  context = createTestContext(database, {
    openMailbox: () => createGmailMailbox(gmail.client),
    aiProviders: { gemini: scriptedProvider() },
  });
  context.clock.set(SYNC_TIME);
  alice = await registerUser(context.app, 'alice@example.com');
  const [user] = await database.db.select({ id: users.id }).from(users).where(eq(users.email, 'alice@example.com'));
  aliceId = user?.id ?? 0;
  await saveGmailAccount(database.db, {
    userId: aliceId,
    emailAddress: 'alex.martin@example.com',
    refreshToken: encryptSecret('1//refresh-token', context.encryptionKey),
    connectedAt: SYNC_TIME,
    resetSync: true,
  });
  await request(context.app).post('/api/gmail/sync').set('Cookie', alice).set('Content-Type', 'application/json');
  await context.queue.drain();
};

const applicationOf = async (companyName: string): Promise<number> => {
  const [row] = await database.db
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(and(eq(companies.userId, aliceId), eq(companies.name, companyName)));
  if (!row) throw new Error(`no application at ${companyName}`);
  return row.id;
};

const draftFor = (id: number, cookie = alice) =>
  request(context.app)
    .post(`/api/applications/${id}/follow-up-draft`)
    .set('Cookie', cookie)
    .set('Content-Type', 'application/json');

beforeEach(async () => {
  await truncateAll(database);
});

afterAll(async () => {
  await database.close();
});

describe('POST /api/applications/:id/follow-up-draft (EF-CAN-17)', () => {
  it('[EF-CAN-17] [RG-20] saves the follow-up as a Gmail draft in the thread, to the contact, and never sends it', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);

    const response = await draftFor(await applicationOf("McDonald's"));

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      draftUrl: 'https://mail.google.com/mail/?authuser=alex.martin%40example.com#drafts?compose=draft-1',
      to: 'recrutement@mcdonalds.example',
      subject: 'Re: Nous avons bien reçu votre candidature',
    });
    expect(gmail.drafts).toHaveLength(1);
    const [draft] = gmail.drafts;
    expect(draft?.threadId).toBe(MCDONALDS_ACKNOWLEDGEMENT.threadId);
    expect(draft?.message).toContain('To: recrutement@mcdonalds.example\r\n');
    const body = Buffer.from(draft?.message.split('\r\n\r\n')[1]?.replace(/\r\n/g, '') ?? '', 'base64').toString();
    expect(body).toBe(FOLLOW_UP.body.replace(/\n/g, '\r\n'));
  });

  it('[EF-CAN-17] [ENF-RGP-01] writes from the facts of the application, signed with the name of the candidate', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);

    await draftFor(await applicationOf("McDonald's"));

    const prompt = writerRequests[0]?.prompt ?? '';
    expect(prompt).toContain("Entreprise : McDonald's");
    expect(prompt).toContain('Dernier état : accusé de réception reçu');
    // The name read on the application the candidate sent in the same thread.
    expect(prompt).toContain('Signature : Alex Martin');
    // Nothing of a message is handed to the AI: its excerpt stays out.
    expect(prompt).not.toContain('Part-Dieu');
  });

  it('[RG-20] [EF-CAN-17] refuses when nobody can be written to', async () => {
    await setUp([]);
    const created = await request(context.app)
      .post('/api/applications')
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({ companyName: 'Muet', jobTitle: 'Data Analyst', status: 'sent' });

    const response = await draftFor((created.body as { id: number }).id);

    expect(response.status).toBe(409);
    expect((response.body as { error: string }).error).toContain('Aucune adresse');
    expect(gmail.drafts).toHaveLength(0);
  });

  it('[RG-06] refuses an application that waits for no follow-up', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    const id = await applicationOf("McDonald's");
    await request(context.app)
      .patch(`/api/applications/${id}`)
      .set('Cookie', alice)
      .set('Content-Type', 'application/json')
      .send({ status: 'interview' });

    expect((await draftFor(id)).status).toBe(409);
  });

  it('[EF-IA-03] [EF-IA-04] saves no draft when no provider writes 80 to 150 words', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    writtenBody = 'Bonjour, où en est ma candidature ? Cordialement.';

    const response = await draftFor(await applicationOf("McDonald's"));

    expect(response.status).toBe(502);
    expect(gmail.drafts).toHaveLength(0);
  });

  it('[EF-AUT-06] never prepares the follow-up of another user’s application', async () => {
    await setUp([SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT]);
    const bob = await registerUser(context.app, 'bob@example.com');

    expect((await draftFor(await applicationOf("McDonald's"), bob)).status).toBe(404);
  });

  it('[EF-AUT-05] refuses without a session', async () => {
    await setUp([]);

    const response = await request(context.app)
      .post('/api/applications/1/follow-up-draft')
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(401);
  });
});
