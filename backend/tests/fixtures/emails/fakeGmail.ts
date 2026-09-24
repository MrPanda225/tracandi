import type { gmail_v1 } from 'googleapis/build/src/apis/gmail/index.js';
import type { GmailClient } from '../../../src/modules/emails/mailbox.js';

/** Gmail's API simulated on recorded messages, with labels and threads: no test ever reaches Google (testing.md). */
export interface FakeGmail {
  client: GmailClient;
  /** Parameters of every `messages.list` call, in order. */
  listCalls: gmail_v1.Params$Resource$Users$Messages$List[];
  /** Ids of every `messages.get` call, in order. */
  readIds: string[];
  /** Parameters of every `threads.modify` call, in order. */
  modifyCalls: gmail_v1.Params$Resource$Users$Threads$Modify[];
  /** Names of the labels created through the API, in order. */
  createdLabels: string[];
  /** Number of `labels.list` calls. */
  labelListings: () => number;
  /** Names of the labels a thread carries now. */
  labelsOfThread: (threadId: string) => string[];
  /** Deletes a label as the user would in Gmail: it disappears from every thread. */
  deleteLabel: (name: string) => void;
  /** A new message arrives in the mailbox. */
  deliver: (message: gmail_v1.Schema$Message) => void;
  /** Gmail answers this message, already in the mailbox under the same id, as given from now on. */
  update: (message: gmail_v1.Schema$Message) => void;
  /** Makes the reading of this message fail like a Gmail outage (HTTP 503), until `restore`. */
  breakMessage: (id: string) => void;
  restore: () => void;
}

const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

const SYSTEM_LABELS = ['INBOX', 'SENT', 'UNREAD', 'IMPORTANT', 'SPAM', 'TRASH', 'DRAFT'];

/**
 * Fake Gmail holding `messages`, listed newest first by pages of `pageSize` like Gmail does. The search query is
 * recorded, not applied: the service must not rely on it alone. `listedButDeleted` are listed ids whose reading
 * answers 404, like a message deleted between the listing and the reading. `existingLabels` already exist in the
 * mailbox, as created by an earlier connection.
 */
export const createFakeGmail = (
  initialMessages: readonly gmail_v1.Schema$Message[],
  {
    pageSize = 2,
    listedButDeleted = [],
    existingLabels = [],
  }: { pageSize?: number; listedButDeleted?: readonly string[]; existingLabels?: readonly string[] } = {},
): FakeGmail => {
  const listCalls: gmail_v1.Params$Resource$Users$Messages$List[] = [];
  const readIds: string[] = [];
  const modifyCalls: gmail_v1.Params$Resource$Users$Threads$Modify[] = [];
  const createdLabels: string[] = [];
  let labelListings = 0;
  const broken = new Set<string>();
  const labelNames = new Map<string, string>(
    [...SYSTEM_LABELS, ...existingLabels].map((name, index) => [
      SYSTEM_LABELS.includes(name) ? name : `Label_${index}`,
      name,
    ]),
  );
  const messages = [...initialMessages];
  const threadLabels = new Map<string, Set<string>>();
  const addToThread = (message: gmail_v1.Schema$Message) => {
    const labels = threadLabels.get(message.threadId ?? '') ?? new Set<string>();
    for (const id of message.labelIds ?? []) labels.add(id);
    threadLabels.set(message.threadId ?? '', labels);
  };
  for (const message of messages) addToThread(message);
  // Listed newest first, like Gmail; the ids of deleted messages come last.
  const listedIds = () => [
    ...[...messages]
      .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
      .map((message) => ({ id: message.id, threadId: message.threadId })),
    ...listedButDeleted.map((id) => ({ id, threadId: id })),
  ];

  const client: GmailClient = {
    list: (params) => {
      listCalls.push(params);
      const listed = listedIds();
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
    listLabels: () => {
      labelListings += 1;
      return Promise.resolve({ data: { labels: [...labelNames].map(([id, name]) => ({ id, name })) } });
    },
    createLabel: (params) => {
      const name = params.requestBody?.name ?? '';
      if ([...labelNames.values()].includes(name)) {
        return Promise.reject(httpError(409, 'Label name exists or conflicts'));
      }
      const id = `Label_${100 + createdLabels.length}`;
      labelNames.set(id, name);
      createdLabels.push(name);
      return Promise.resolve({ data: { id, name } });
    },
    modifyThread: (params) => {
      modifyCalls.push(params);
      const labels = threadLabels.get(params.id ?? '');
      if (!labels) return Promise.reject(httpError(404, 'Requested entity was not found.'));
      const add = params.requestBody?.addLabelIds ?? [];
      const remove = params.requestBody?.removeLabelIds ?? [];
      if ([...add, ...remove].some((id) => !labelNames.has(id))) {
        return Promise.reject(httpError(400, 'Invalid label'));
      }
      for (const id of remove) labels.delete(id);
      for (const id of add) labels.add(id);
      return Promise.resolve({ data: {} });
    },
  };

  return {
    client,
    listCalls,
    readIds,
    modifyCalls,
    createdLabels,
    labelListings: () => labelListings,
    labelsOfThread: (threadId) =>
      [...(threadLabels.get(threadId) ?? [])].map((id) => labelNames.get(id) ?? id).sort(),
    deleteLabel: (name) => {
      const id = [...labelNames].find(([, candidate]) => candidate === name)?.[0];
      if (!id) return;
      labelNames.delete(id);
      for (const labels of threadLabels.values()) labels.delete(id);
    },
    deliver: (message) => {
      messages.push(message);
      addToThread(message);
    },
    update: (message) => {
      const at = messages.findIndex((candidate) => candidate.id === message.id);
      if (at === -1) throw new Error(`no message ${message.id ?? ''} to update`);
      messages[at] = message;
    },
    breakMessage: (id) => broken.add(id),
    restore: () => broken.clear(),
  };
};
