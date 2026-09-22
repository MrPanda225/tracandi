import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import type { GmailMessagesClient } from '../../../src/modules/emails/mailbox.js';

/** Gmail's messages API simulated on recorded messages: no test ever reaches Google (testing.md). */
export interface FakeGmail {
  client: GmailMessagesClient;
  /** Parameters of every `messages.list` call, in order. */
  listCalls: gmail_v1.Params$Resource$Users$Messages$List[];
  /** Ids of every `messages.get` call, in order. */
  readIds: string[];
  /** Makes the reading of this message fail like a Gmail outage (HTTP 503), until `restore`. */
  breakMessage: (id: string) => void;
  restore: () => void;
}

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

/**
 * Fake Gmail holding `messages`, listed newest first by pages of `pageSize` like Gmail does. The search query is
 * recorded, not applied: the service must not rely on it alone. `listedButDeleted` are listed ids whose reading
 * answers 404, like a message deleted between the listing and the reading.
 */
export const createFakeGmail = (
  messages: readonly gmail_v1.Schema$Message[],
  { pageSize = 2, listedButDeleted = [] }: { pageSize?: number; listedButDeleted?: readonly string[] } = {},
): FakeGmail => {
  const listCalls: gmail_v1.Params$Resource$Users$Messages$List[] = [];
  const readIds: string[] = [];
  const broken = new Set<string>();
  const listed = [
    ...[...messages]
      .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
      .map((message) => ({ id: message.id, threadId: message.threadId })),
    ...listedButDeleted.map((id) => ({ id, threadId: id })),
  ];

  const client: GmailMessagesClient = {
    list: (params) => {
      listCalls.push(params);
      const start = Number(params.pageToken ?? 0);
      const end = start + Math.min(pageSize, params.maxResults ?? pageSize);
      return Promise.resolve({
        data: {
          messages: listed.slice(start, end),
          nextPageToken: end < listed.length ? String(end) : undefined,
          resultSizeEstimate: listed.length,
        },
      });
    },
    get: (params) => {
      readIds.push(params.id ?? '');
      if (broken.has(params.id ?? '')) return Promise.reject(httpError(503, 'Backend Error'));
      const message = messages.find((candidate) => candidate.id === params.id);
      return message
        ? Promise.resolve({ data: message })
        : Promise.reject(httpError(404, 'Requested entity was not found.'));
    },
  };

  return {
    client,
    listCalls,
    readIds,
    breakMessage: (id) => broken.add(id),
    restore: () => broken.clear(),
  };
};
