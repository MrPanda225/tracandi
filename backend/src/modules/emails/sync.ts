import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { normalizeKey } from '../../lib/text.js';
import { buildClassifyEmailsPrompt, type MessageToClassify } from '../../llm/prompts/classifyEmails.js';
import type { LlmRouter } from '../../llm/router.js';
import type { ProviderName } from '../../llm/types.js';
import { attachIncomingMessage } from '../applications/service.js';
import { type ClassifiedMessage, ClassificationSchema } from './classification.js';
import type { MessageFetcher, RetainedMessage } from './fetcher.js';
import type { PlatformRef } from './prefilter.js';
import * as repository from './repository.js';
import type { Executor } from './repository.js';

/** ENF-COU-01: messages classified by one AI call. */
export const CLASSIFY_BATCH_SIZE = 10;

/** Counters of one synchronisation (EF-GML-04). */
export interface SyncReport {
  /** New messages read in the mailbox. */
  read: number;
  /** New messages kept by the RG-10 pre-filter. */
  retained: number;
  /** Retained messages classified by the AI and recorded. */
  classified: number;
}

/** A synchronisation of this user is already running: a second one would read the same messages. */
export class SyncAlreadyRunningError extends HttpError {
  constructor() {
    super(409, 'Une synchronisation Gmail est déjà en cours.');
  }
}

export interface GmailSync {
  /**
   * Reads the new messages, classifies the retained ones by batches of 10, stores them and updates the applications
   * (RG-03, RG-04), then moves the date of the last synchronisation.
   * @throws GmailNotConnectedError (409), SyncAlreadyRunningError (409), LlmUnavailableError (502: the batches
   * classified before are kept, the others wait for the next pass), or a Gmail or database failure.
   */
  synchronise: (userId: number) => Promise<SyncReport>;
}

interface GmailSyncDeps {
  db: Database;
  fetcher: MessageFetcher;
  router: LlmRouter;
  clock: Clock;
  logger: Logger;
}

interface ClassifiedPair {
  message: RetainedMessage;
  classification: ClassifiedMessage;
}

const toMessageToClassify = (message: RetainedMessage): MessageToClassify => ({
  direction: message.direction,
  receivedAt: message.receivedAt,
  from: message.sender,
  subject: message.subject,
  snippet: message.snippet,
});

const batchesOf = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CLASSIFY_BATCH_SIZE) }, (_, index) =>
    items.slice(index * CLASSIFY_BATCH_SIZE, (index + 1) * CLASSIFY_BATCH_SIZE),
  );

/** Each message of the batch with its answer (reference = position + 1); a message left unanswered is left out. */
const pairAnswers = (
  batch: readonly RetainedMessage[],
  answers: readonly ClassifiedMessage[],
): ClassifiedPair[] => {
  const byRef = new Map(answers.map((answer) => [answer.ref, answer]));
  return batch.flatMap((message, index) => {
    const classification = byRef.get(index + 1);
    return classification ? [{ message, classification }] : [];
  });
};

/** EF-GML-10: the known platform of the sender, else the platform named by the AI, recorded on first sight. */
const platformOf = async (
  tx: Executor,
  { message, classification }: ClassifiedPair,
): Promise<PlatformRef | null> => {
  if (message.platform) return message.platform;
  if (!classification.platform) return null;
  const name = classification.platform;
  return { id: await repository.upsertPlatform(tx, { name, nameKey: normalizeKey(name) }), name };
};

/**
 * Stores one classified message and attaches it (RG-02, RG-03); job alerts are stored alone.
 * @req EF-GML-08, EF-GML-09, EF-GML-10, EF-GML-11, EF-GML-12, EF-GML-19
 */
const recordMessage = async (
  tx: Executor,
  { userId, pair, provider }: { userId: number; pair: ClassifiedPair; provider: ProviderName },
): Promise<void> => {
  const { message, classification } = pair;
  if (classification.category === 'off_topic') return;
  const platform = await platformOf(tx, pair);
  const emailId = await repository.insertEmail(tx, {
    userId,
    gmailMessageId: message.gmailMessageId,
    gmailThreadId: message.gmailThreadId,
    direction: message.direction,
    fromAddress: message.fromAddress,
    subject: message.subject,
    snippet: message.snippet,
    category: classification.category,
    platformId: platform?.id ?? null,
    receivedAt: message.receivedAt,
    classifiedBy: provider,
  });
  if (classification.category === 'job_alert') return;
  await attachIncomingMessage(tx, {
    userId,
    emailId,
    category: classification.category,
    receivedAt: message.receivedAt,
    employer: classification.employer,
    platform,
    jobTitle: classification.jobTitle,
    contractType: classification.contractType,
  });
};

/**
 * Stores a classified batch in date order (RG-04): every message marked processed, off-topic ones without any content
 * (Q-08), the others stored and attached.
 */
const recordBatch = async (
  tx: Executor,
  {
    userId,
    pairs,
    provider,
    processedAt,
  }: { userId: number; pairs: ClassifiedPair[]; provider: ProviderName; processedAt: Date },
): Promise<void> => {
  const idsOf = (isOffTopic: boolean) =>
    pairs
      .filter((pair) => (pair.classification.category === 'off_topic') === isOffTopic)
      .map((pair) => pair.message.gmailMessageId);
  await repository.insertProcessedMessages(tx, {
    userId,
    gmailMessageIds: idsOf(true),
    outcome: 'off_topic',
    processedAt,
  });
  await repository.insertProcessedMessages(tx, {
    userId,
    gmailMessageIds: idsOf(false),
    outcome: 'retained',
    processedAt,
  });
  for (const pair of pairs) await recordMessage(tx, { userId, pair, provider });
};

/**
 * Creates the Gmail synchronisation: incremental fetch (T-302), classification by the AI router (RG-13: Gemini then
 * Claude), storage and attachment. One synchronisation at a time per user.
 * @req EF-GML-04, EF-GML-06, EF-GML-08 to EF-GML-12, EF-GML-19, EF-CAN-11, EF-CFG-01, ENF-FIA-03
 */
export const createGmailSync = ({ db, fetcher, router, clock, logger }: GmailSyncDeps): GmailSync => {
  const running = new Set<number>();

  const classifyBatch = async (userId: number, batch: RetainedMessage[]) => {
    const { system, prompt } = buildClassifyEmailsPrompt(batch.map(toMessageToClassify));
    const { data, provider } = await router.runTask('classify_emails', {
      userId,
      system,
      prompt,
      schema: ClassificationSchema,
    });
    return { provider, pairs: pairAnswers(batch, data.messages) };
  };

  const run = async (userId: number): Promise<SyncReport> => {
    const startedAt = clock();
    const { readCount, retained } = await fetcher.fetchNewMessages(userId);
    let classified = 0;
    for (const batch of batchesOf(retained)) {
      const { provider, pairs } = await classifyBatch(userId, batch);
      await db.transaction((tx) => recordBatch(tx, { userId, pairs, provider, processedAt: clock() }));
      classified += pairs.length;
    }
    // A message the AI skipped is still unprocessed: the next pass must read it again from the same date.
    if (classified === retained.length) await repository.setLastSyncAt(db, userId, startedAt);
    else
      logger.warn('gmail messages left for the next synchronisation', {
        unclassified: retained.length - classified,
      });
    return { read: readCount, retained: retained.length, classified };
  };

  return {
    async synchronise(userId) {
      if (running.has(userId)) throw new SyncAlreadyRunningError();
      running.add(userId);
      try {
        return await run(userId);
      } finally {
        running.delete(userId);
      }
    },
  };
};
