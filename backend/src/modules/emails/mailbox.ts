// The Gmail entry point only: the whole googleapis index describes every Google API and exhausts the typed lint.
import { auth, gmail, type gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import { z } from 'zod';
import { bodyTextOf, type MessagePart } from './bodyText.js';
import type { GoogleOAuthConfig } from './googleOAuth.js';
import { type GmailRetry, throttleGmailClient } from './quota.js';

/** ENF-RGP-01: at most 300 characters of a message are kept, besides its metadata. */
export const SNIPPET_MAX_LENGTH = 300;
export { BODY_TEXT_MAX_LENGTH } from './bodyText.js';
// Same bounds as the data model: emails.from_address 320, emails.subject 500.
const ADDRESS_MAX_LENGTH = 320;
const SUBJECT_MAX_LENGTH = 500;
// Gmail's largest page: fewer calls on the first synchronisation of 120 days.
const LIST_PAGE_SIZE = 500;
// A request that hangs must not block the synchronisation forever (ENF-FIA-01).
const GMAIL_REQUEST_TIMEOUT_MS = 30_000;
const HTTP_NOT_FOUND = 404;
const SENT_LABEL = 'SENT';

/** The part of Gmail's API used here (messages, labels, threads), injected so that tests never call Google. */
export interface GmailClient {
  list: (
    params: gmail_v1.Params$Resource$Users$Messages$List,
  ) => Promise<{ data: gmail_v1.Schema$ListMessagesResponse }>;
  get: (params: gmail_v1.Params$Resource$Users$Messages$Get) => Promise<{ data: gmail_v1.Schema$Message }>;
  listLabels: (
    params: gmail_v1.Params$Resource$Users$Labels$List,
  ) => Promise<{ data: gmail_v1.Schema$ListLabelsResponse }>;
  createLabel: (
    params: gmail_v1.Params$Resource$Users$Labels$Create,
  ) => Promise<{ data: gmail_v1.Schema$Label }>;
  modifyThread: (params: gmail_v1.Params$Resource$Users$Threads$Modify) => Promise<unknown>;
}

/** A Gmail label: its id and its full name (« Candidatures/Atelier Nova »). */
export interface GmailLabel {
  id: string;
  name: string;
}

/**
 * A message as the application knows it: metadata, the excerpt kept, and the start of the body, read for the
 * classification only and never stored (ENF-RGP-01, BES-30).
 */
export interface MailboxMessage {
  gmailMessageId: string;
  gmailThreadId: string;
  direction: 'inbound' | 'outbound';
  /** The From header as written (name and address), for the classification only: never stored. */
  sender: string | null;
  fromAddress: string | null;
  /** RG-03 (v1.20): address of the first recipient, whose domain may name the company. Never stored. */
  toAddress: string | null;
  subject: string | null;
  /** Gmail's excerpt, decoded, spaces collapsed, at most 300 characters: the only text stored. */
  snippet: string;
  /** Start of the body as plain text (at most 2 000 characters), empty when unreadable. Never stored nor logged. */
  text: string;
  receivedAt: Date;
}

/** Access to one mailbox: reading messages, and labels (never sending nor deleting, ENF-SEC-07). */
export interface GmailMailbox {
  /** Ids of the messages matching a Gmail search, all pages read. */
  listMessageIds: (query: string) => Promise<string[]>;
  /** A message, or null when it was deleted since the listing. @throws on any other Gmail failure. */
  getMessage: (id: string) => Promise<MailboxMessage | null>;
  /** Every label of the mailbox, system ones included. */
  listLabels: () => Promise<GmailLabel[]>;
  /** Creates a label shown in the label list and on messages; returns its id. */
  createLabel: (name: string) => Promise<string>;
  /** Adds and removes labels on every message of a thread (EF-GML-13 to 16). */
  modifyThread: (
    threadId: string,
    change: { add: readonly string[]; remove: readonly string[] },
  ) => Promise<void>;
}

/** Opens the mailbox authorised by a (clear) refresh token. */
export type OpenMailbox = (refreshToken: string) => GmailMailbox;

// External data: Gmail's answers are parsed before use (clean-code.md).
const MessagePartSchema: z.ZodType<MessagePart> = z.lazy(() =>
  z.object({
    mimeType: z.string().nullish(),
    filename: z.string().nullish(),
    headers: z.array(z.object({ name: z.string().nullish(), value: z.string().nullish() })).nullish(),
    body: z.object({ data: z.string().nullish(), attachmentId: z.string().nullish() }).nullish(),
    parts: z.array(MessagePartSchema).nullish(),
  }),
);

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
  payload: MessagePartSchema.nullish(),
});
type MessageAnswer = z.infer<typeof MessageAnswerSchema>;

const LabelsAnswerSchema = z.object({
  labels: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).nullish(),
});
const CreatedLabelSchema = z.object({ id: z.string().min(1) });

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

// The first address of a list, bracketed or bare, in the order written: a display name may hold a comma.
const FIRST_ADDRESS = /<([^<>\s]+@[^<>\s]+)>|([^\s<>",;]+@[^\s<>",;]+)/;

/** The first address of a To header, or null when it holds none. */
const firstAddressOf = (recipients: string | null): string | null => {
  const match = recipients ? FIRST_ADDRESS.exec(recipients) : null;
  const address = match?.[1] ?? match?.[2];
  return address ? clip(address.toLowerCase(), ADDRESS_MAX_LENGTH) : null;
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
    toAddress: firstAddressOf(headerOf(message, 'To')),
    subject: subject ? clip(subject, SUBJECT_MAX_LENGTH) : null,
    snippet: plainSnippet(message.snippet ?? ''),
    text: bodyTextOf(message.payload),
    receivedAt: new Date(Number(message.internalDate)),
  };
};

const INVALID_GRANT = 'invalid_grant';

/**
 * Q-11: Google refused the refresh token (expired after 7 days in test mode, or revoked by the user): only a new
 * connection helps. Google's OAuth client reports it as the message, or as the `error` of the answer.
 */
export const isInvalidGrant = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const answer = (error as { response?: { data?: unknown } }).response?.data;
  const answerError =
    typeof answer === 'object' && answer !== null && 'error' in answer ? answer.error : null;
  return error.message === INVALID_GRANT || answerError === INVALID_GRANT;
};

/** True when a Gmail call failed with this HTTP status. */
export const hasHttpStatus = (error: unknown, status: number): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === status;

/**
 * Gmail mailbox on Gmail's API: searches, then reads one message (From and Subject headers, excerpt, date, labels,
 * and the start of its body as text, for the classification only: BES-30), and sets labels on threads. Of the body,
 * only Gmail's 300-character excerpt is ever kept (ENF-RGP-01).
 * @throws when Gmail fails or answers outside its format, except a message deleted since the listing (null).
 * @req EF-GML-03, EF-GML-05, EF-GML-08, EF-GML-13, EF-GML-14, EF-GML-15, EF-GML-16, ENF-RGP-01
 */
export const createGmailMailbox = (client: GmailClient): GmailMailbox => ({
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
        // BES-30: `metadata` gives Gmail's excerpt alone, cut before a refusal that follows a long opening.
        format: 'full',
      });
      return toMailboxMessage(MessageAnswerSchema.parse(data));
    } catch (error) {
      if (hasHttpStatus(error, HTTP_NOT_FOUND)) return null;
      throw error;
    }
  },

  async listLabels() {
    const { data } = await client.listLabels({ userId: 'me' });
    return LabelsAnswerSchema.parse(data).labels ?? [];
  },

  async createLabel(name) {
    const { data } = await client.createLabel({
      userId: 'me',
      requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    });
    return CreatedLabelSchema.parse(data).id;
  },

  async modifyThread(threadId, { add, remove }) {
    await client.modifyThread({
      userId: 'me',
      id: threadId,
      requestBody: { addLabelIds: [...add], removeLabelIds: [...remove] },
    });
  },
});

/**
 * Opens mailboxes on the real Gmail API with the OAuth client of the configuration; the access token is renewed from
 * the refresh token by the Google client. Each mailbox has its own quota governor: Gmail counts its limits per user,
 * and the calls of one synchronisation are spaced and attempted again accordingly (ENF-FIA-03).
 * @req EF-GML-03, EF-GML-13, ENF-FIA-03
 */
export const connectGmailMailbox =
  (
    { clientId, clientSecret, redirectUri }: GoogleOAuthConfig,
    { onRetry }: { onRetry?: (retry: GmailRetry) => void } = {},
  ): OpenMailbox =>
  (refreshToken) => {
    const client = new auth.OAuth2(clientId, clientSecret, redirectUri);
    client.setCredentials({ refresh_token: refreshToken });
    const { messages, labels, threads } = gmail({
      version: 'v1',
      auth: client,
      timeout: GMAIL_REQUEST_TIMEOUT_MS,
    }).users;
    return createGmailMailbox(
      throttleGmailClient(
        {
          list: (params) => messages.list(params),
          get: (params) => messages.get(params),
          listLabels: (params) => labels.list(params),
          createLabel: (params) => labels.create(params),
          modifyThread: (params) => threads.modify(params),
        },
        { onRetry },
      ),
    );
  };
