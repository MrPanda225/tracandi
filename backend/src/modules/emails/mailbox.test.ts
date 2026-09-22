import { describe, expect, it } from 'vitest';
import { createFakeGmail } from '../../../tests/fixtures/emails/fakeGmail.js';
import {
  APEC_INNOVA,
  BANK_STATEMENT,
  LONG_NEWSLETTER,
  MCDONALDS_ACKNOWLEDGEMENT,
  SENT_APPLICATION,
} from '../../../tests/fixtures/emails/messages.js';
import { createGmailMailbox, SNIPPET_MAX_LENGTH } from './mailbox.js';

describe('createGmailMailbox — listing', () => {
  it('[EF-GML-05] follows every page of the search and asks for large pages', async () => {
    const gmail = createFakeGmail(
      [SENT_APPLICATION, MCDONALDS_ACKNOWLEDGEMENT, BANK_STATEMENT, APEC_INNOVA],
      {
        pageSize: 3,
      },
    );
    const mailbox = createGmailMailbox(gmail.client);

    const ids = await mailbox.listMessageIds('after:1756000000 -in:drafts');

    expect(ids).toEqual([
      APEC_INNOVA.id,
      BANK_STATEMENT.id,
      MCDONALDS_ACKNOWLEDGEMENT.id,
      SENT_APPLICATION.id,
    ]);
    expect(gmail.listCalls).toEqual([
      { userId: 'me', q: 'after:1756000000 -in:drafts', maxResults: 500, pageToken: undefined },
      { userId: 'me', q: 'after:1756000000 -in:drafts', maxResults: 500, pageToken: '3' },
    ]);
  });

  it('[EF-GML-05] gives an empty list when nothing matches', async () => {
    const mailbox = createGmailMailbox(createFakeGmail([]).client);

    expect(await mailbox.listMessageIds('after:1756000000')).toEqual([]);
  });

  it('[EF-GML-05] refuses an answer that is not Gmail’s', async () => {
    const mailbox = createGmailMailbox({
      ...createFakeGmail([]).client,
      list: () => Promise.resolve({ data: { messages: [{ threadId: 'no-id' }] } }),
    });

    await expect(mailbox.listMessageIds('after:1')).rejects.toThrow();
  });
});

describe('createGmailMailbox — reading a message', () => {
  it('[ENF-RGP-01] reads the metadata only, never the body', async () => {
    const gmail = createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]);
    const requests: unknown[] = [];
    const mailbox = createGmailMailbox({
      ...gmail.client,
      get: (params) => {
        requests.push(params);
        return gmail.client.get(params);
      },
    });

    await mailbox.getMessage(MCDONALDS_ACKNOWLEDGEMENT.id ?? '');

    expect(requests).toEqual([
      {
        userId: 'me',
        id: MCDONALDS_ACKNOWLEDGEMENT.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      },
    ]);
  });

  it('[EF-GML-06] [ENF-RGP-01] gives the metadata of a received message, its excerpt decoded', async () => {
    const mailbox = createGmailMailbox(createFakeGmail([MCDONALDS_ACKNOWLEDGEMENT]).client);

    expect(await mailbox.getMessage(MCDONALDS_ACKNOWLEDGEMENT.id ?? '')).toEqual({
      gmailMessageId: MCDONALDS_ACKNOWLEDGEMENT.id,
      gmailThreadId: MCDONALDS_ACKNOWLEDGEMENT.threadId,
      direction: 'inbound',
      sender: '"McDonald\'s Recrutement" <recrutement@mcdonalds.example>',
      fromAddress: 'recrutement@mcdonalds.example',
      subject: 'Nous avons bien reçu votre candidature',
      snippet:
        "Bonjour Alex, merci pour votre candidature au poste d'équipier polyvalent chez McDonald's Lyon " +
        'Part-Dieu. Nous reviendrons vers vous "très vite" & au plus tard sous 15 jours.',
      receivedAt: new Date('2026-09-02T14:30:00.000Z'),
    });
  });

  it('[EF-GML-03] tells a message sent by the candidate by its SENT label', async () => {
    const mailbox = createGmailMailbox(createFakeGmail([SENT_APPLICATION]).client);

    const message = await mailbox.getMessage(SENT_APPLICATION.id ?? '');

    expect(message?.direction).toBe('outbound');
    expect(message?.fromAddress).toBe('alex.martin@example.com');
  });

  it('[ENF-RGP-01] keeps at most 300 characters of the excerpt, spaces collapsed', async () => {
    const mailbox = createGmailMailbox(createFakeGmail([LONG_NEWSLETTER]).client);

    const message = await mailbox.getMessage(LONG_NEWSLETTER.id ?? '');

    expect(SNIPPET_MAX_LENGTH).toBe(300);
    expect(message?.snippet).toHaveLength(300);
    expect(message?.snippet).not.toMatch(/\s{2}/);
  });

  it.each([
    ['numeric', '&#233;t&#xE9;', 'été'],
    ['named', '&lt;b&gt; &apos;x&apos; &nbsp;', "<b> 'x'"],
    ['out of Unicode', '&#1114112; &#x110000;', '&#1114112; &#x110000;'],
    ['unknown', '&copy; &eacute;', '&copy; &eacute;'],
  ])('[ENF-RGP-01] decodes the %s entities Gmail puts in the excerpt', async (_case, snippet, expected) => {
    const message = { ...BANK_STATEMENT, snippet };
    const mailbox = createGmailMailbox(createFakeGmail([message]).client);

    expect((await mailbox.getMessage(BANK_STATEMENT.id ?? ''))?.snippet).toBe(expected);
  });

  it('[ENF-RGP-01] accepts a message without subject, sender nor excerpt', async () => {
    const bare = { ...BANK_STATEMENT, snippet: null, labelIds: null, payload: { headers: [] } };
    const mailbox = createGmailMailbox(createFakeGmail([bare]).client);

    expect(await mailbox.getMessage(BANK_STATEMENT.id ?? '')).toMatchObject({
      direction: 'inbound',
      sender: null,
      fromAddress: null,
      subject: null,
      snippet: '',
    });
  });

  it.each([
    ['a bare address', 'offres@emplois.example', 'offres@emplois.example'],
    ['a name without quotes', 'Emplois Lyon <offres@emplois.example>', 'offres@emplois.example'],
    ['no address at all', 'Undisclosed recipients', null],
  ])('[EF-GML-10] reads the sender address from %s', async (_case, from, expected) => {
    const message = { ...BANK_STATEMENT, payload: { headers: [{ name: 'from', value: from }] } };
    const mailbox = createGmailMailbox(createFakeGmail([message]).client);

    expect((await mailbox.getMessage(BANK_STATEMENT.id ?? ''))?.fromAddress).toBe(expected);
  });

  it('[EF-GML-06] gives null for a message deleted since the listing', async () => {
    const mailbox = createGmailMailbox(createFakeGmail([]).client);

    expect(await mailbox.getMessage('18f0000000000000')).toBeNull();
  });

  it('[ENF-FIA-03] lets any other Gmail failure through', async () => {
    const gmail = createFakeGmail([BANK_STATEMENT]);
    gmail.breakMessage(BANK_STATEMENT.id ?? '');

    await expect(createGmailMailbox(gmail.client).getMessage(BANK_STATEMENT.id ?? '')).rejects.toThrow(
      'Backend Error',
    );
  });

  it('[ENF-FIA-03] refuses a message without date', async () => {
    const undated = { ...BANK_STATEMENT, internalDate: null };
    const mailbox = createGmailMailbox(createFakeGmail([undated]).client);

    await expect(mailbox.getMessage(BANK_STATEMENT.id ?? '')).rejects.toThrow();
  });
});
