// The Gmail entry point only: the whole googleapis index describes every Google API and exhausts the typed lint.
import { auth, gmail, type gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import { z } from 'zod';
import type { GoogleOAuthConfig } from './googleOAuth.js';

/** ENF-RGP-01: at most 300 characters of a message are kept, besides its metadata. */
export const SNIPPET_MAX_LENGTH = 300;
// Same bounds as the data model: emails.from_address 320, emails.subject 500.
const ADDRESS_MAX_LENGTH = 320;
const SUBJECT_MAX_LENGTH = 500;
// Gmail's largest page: fewer calls on the first synchronisation of 120 days.
const LIST_PAGE_SIZE = 500;
// A request that hangs must not block the synchronisation forever (ENF-FIA-01).
const GMAIL_REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;
const SENT_LABEL = 'SENT';

/** The part of Gmail's messages API used here, injected so that tests never call Google. */
export interface GmailMessagesClient {
  list: (
    params: gmail_v1.Params$Resource$Users$Messages$List,
  ) => Promise<{ data: gmail_v1.Schema$ListMessagesResponse }>;
  get: (params: gmail_v1.Params$Resource$Users$Messages$Get) => Promise<{ data: gmail_v1.Schema$Message }>;
}

/** A message as the application knows it: metadata and an excerpt, never the body (ENF-RGP-01). */
export interface MailboxMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  direction: 'inbound' | 'outbound';
  /** The From header as written (name and address), for the classification only: never stored. */
  sender: string | null;
  fromAddress: string | null;
  subject: string | null;
  /** Gmail's excerpt, decoded, spaces collapsed, at most 300 characters. */
  snippet: string;
  receivedAt: Date;
}

/** Read access to one mailbox. */
export interface GmailMailbox {
  /** Ids of the messages matching a Gmail search, all pages read. */
  listMessageIds: (query: string) => Promise<string[]>;
  /** A message, or null when it was deleted since the listing. @throws on any other Gmail failure. */
  getMessage: (id: string) => Promise<MailboxMessage | null>;
}

/** Opens the mailbox authorised by a (clear) refresh token. */
export type OpenMailbox = (refreshToken: string) => GmailMailbox;

// External data: Gmail's answers are parsed before use (clean-code.md).
const ListAnswerSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).nullish(),
  nextPageToken: z.string().nullish(),
});

const MessageAnswerSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  labelIds: z.array(z.string()).nullish(),
  snippet: z.string().nullish(),
  internalDate: z.string().regex(/^\d+$/),
  payload: z
    .object({
      headers: z.array(z.object({ name: z.string().nullish(), value: z.string().nullish() })).nullish(),
    })
    .nullish(),
});
type MessageAnswer = z.infer<typeof MessageAnswerSchema>;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
const MAX_CODE_POINT = 0x10ffff;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const DECIMAL = 10;
const HEXADECIMAL = 16;

const decodeEntity = (entity: string, body: string): string => {
  if (!body.startsWith('#')) return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  const isHex = body[1]?.toLowerCase() === 'x';
  const codePoint = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? HEXADECIMAL : DECIMAL);
  return codePoint <= MAX_CODE_POINT ? String.fromCodePoint(codePoint) : entity;
};

/** The first characters of a text, counted in Unicode characters like PostgreSQL does. */
const clip = (text: string, maxLength: number): string => Array.from(text).slice(0, maxLength).join('');

/** Gmail escapes its excerpt as HTML; the application stores plain text (rendered by React, never as HTML). */
const plainSnippet = (snippet: string): string =>
  clip(snippet.replace(ENTITY, decodeEntity).replace(/\s+/g, ' ').trim(), SNIPPET_MAX_LENGTH);

const headerOf = (message: MessageAnswer, name: string): string | null => {
  const header = message.payload?.headers?.find(
    (candidate) => candidate.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? null;
};

/** The address of a From header: « Name <a@b> » or « a@b »; null when it holds none. */
const addressOf = (from: string): string | null => {
  const address = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] ?? /[^\s<>"]+@[^\s<>"]+/.exec(from)?.[0];
  return address ? clip(address, ADDRESS_MAX_LENGTH) : null;
};

const toMailboxMessage = (message: MessageAnswer): MailboxMessage => {
  const sender = headerOf(message, 'From');
  const subject = headerOf(message, 'Subject');
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    direction: message.labelIds?.includes(SENT_LABEL) ? 'outbound' : 'inbound',
    sender: sender ? clip(sender, ADDRESS_MAX_LENGTH) : null,
    fromAddress: sender ? addressOf(sender) : null,
    subject: subject ? clip(subject, SUBJECT_MAX_LENGTH) : null,
    snippet: plainSnippet(message.snippet ?? ''),
    receivedAt: new Date(Number(message.internalDate)),
  };
};

const isNotFound = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === HTTP_NOT_FOUND;

/**
 * Gmail mailbox on a messages API: searches, then reads the metadata of one message (From and Subject headers,
 * excerpt, date, labels). The body is never requested (ENF-RGP-01).
 * @throws when Gmail fails or answers outside its format, except a message deleted since the listing (null).
 * @req EF-GML-03, EF-GML-05, ENF-RGP-01
 */
export const createGmailMailbox = (client: GmailMessagesClient): GmailMailbox => ({
  async listMessageIds(query) {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await client.list({ userId: 'me', q: query, maxResults: LIST_PAGE_SIZE, pageToken });
      const page = ListAnswerSchema.parse(data);
      ids.push(...(page.messages ?? []).map((message) => message.id));
      pageToken = page.nextPageToken ?? undefined;
    } while (pageToken);
    return ids;
  },

  async getMessage(id) {
    try {
      const { data } = await client.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });
      return toMailboxMessage(MessageAnswerSchema.parse(data));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },
});

/**
 * Opens mailboxes on the real Gmail API with the OAuth client of the configuration; the access token is renewed from
 * the refresh token by the Google client.
 * @req EF-GML-03
 */
export const connectGmailMailbox =
  ({ clientId, clientSecret, redirectUri }: GoogleOAuthConfig): OpenMailbox =>
  (refreshToken) => {
    const client = new auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials({ refresh_token: refreshToken });
    const { messages } = gmail({ version: 'v1', auth: client, timeout: GMAIL_REQUEST_TIMEOUT_MS }).users;
    return createGmailMailbox({
      list: (params) => messages.list(params),
      get: (params) => messages.get(params),
    });
  };
