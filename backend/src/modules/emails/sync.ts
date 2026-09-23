import type { Database } from '../../db/client.js';
import type { JobJournal, RunCounters } from '../../jobs/journal.js';
import type { TriggerType } from '../../jobs/repository.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { normalizeKey } from '../../lib/text.js';
import { buildClassifyEmailsPrompt, type MessageToClassify } from '../../llm/prompts/classifyEmails.js';
import type { LlmRouter } from '../../llm/router.js';
import type { ProviderName } from '../../llm/types.js';
import { attachIncomingMessage, findApplicationThreads } from '../applications/service.js';
import { type ClassifiedMessage, ClassificationSchema } from './classification.js';
import { applyCategoryCues } from './cues.js';
import type { MessageFetcher, RetainedMessage } from './fetcher.js';
import { createThreadLabeler, databaseLabelCache, type ThreadLabeler } from './labels.js';
import { isInvalidGrant } from './mailbox.js';
import type { PlatformRef } from './prefilter.js';
import { isRateLimited } from './quota.js';
import * as repository from './repository.js';
import type { Executor } from './repository.js';

/** ENF-COU-01: messages classified by one AI call. */
export const CLASSIFY_BATCH_SIZE = 10;
/**
 * ENF-PERF-02: a pass spends its time waiting for the AI, one batch after the other. Several batches are classified
 * at once, and their answers are recorded strictly in the order of the batches — RG-04 reads the statuses in the
 * order the messages arrived, and an interruption must leave the oldest messages recorded (ENF-FIA-03).
 */
export const CLASSIFY_CONCURRENCY = 3;

/** Counters of one synchronisation (EF-GML-04). */
export interface SyncReport {
  /** New messages read in the mailbox. */
  read: number;
  /** New messages kept by the RG-10 pre-filter. */
  retained: number;
  /** Retained messages classified by the AI and recorded. */
  classified: number;
  /** EF-GML-04: messages are still waiting — the pass was bounded, or the AI left some behind (ENF-FIA-03). */
  pending: boolean;
}

/** A synchronisation of this user is already running: a second one would read the same messages. */
export class SyncAlreadyRunningError extends HttpError {
  constructor() {
    super(409, 'Une synchronisation Gmail est déjà en cours.');
  }
}

/** Q-11: Google refused the authorisation (7 days in test mode, or revoked): Gmail must be connected again. */
export class GmailAuthorizationExpiredError extends HttpError {
  constructor() {
    super(409, 'L’autorisation Gmail a expiré : reconnectez Gmail depuis les Réglages.');
  }
}

/**
 * Gmail still refused the calls of the pass once the attempts were spent (quota of the minute exhausted). What was
 * read and classified is kept; the next pass continues from there (503, ENF-FIA-03).
 */
export class GmailQuotaExceededError extends HttpError {
  constructor() {
    super(
      503,
      'Gmail limite temporairement le nombre de requêtes. Les messages déjà lus sont enregistrés : ' +
        'relancez la synchronisation dans quelques minutes.',
    );
  }
}

export interface GmailSync {
  /**
   * Reads the new messages, classifies the retained ones by batches of 10, stores them and updates the applications
   * (RG-03, RG-04), then moves the date of the last synchronisation. Every execution is journaled in `job_runs`.
   * @throws GmailNotConnectedError (409), SyncAlreadyRunningError (409), GmailAuthorizationExpiredError (409, the
   * connection is marked expired), GmailQuotaExceededError (503, Gmail's quota still refused the calls),
   * LlmUnavailableError (502: the batches classified before are kept, the others wait for the next pass), or a Gmail
   * or database failure.
   */
  synchronise: (userId: number, trigger: TriggerType) => Promise<SyncReport>;
  /**
   * EF-GML-03: synchronises, one after the other, every connected mailbox whose authorisation holds. Never throws:
   * the failure of one user is journaled and logged, the others still run (ENF-FIA-01).
   */
  synchroniseEveryMailbox: () => Promise<void>;
}

interface GmailSyncDeps {
  db: Database;
  fetcher: MessageFetcher;
  router: LlmRouter;
  journal: JobJournal;
  clock: Clock;
  logger: Logger;
}

const countersOf = (report: SyncReport): RunCounters => ({
  messages_read: report.read,
  messages_retained: report.retained,
  messages_classified: report.classified,
});

interface ClassifiedPair {
  message: RetainedMessage;
  classification: ClassifiedMessage;
}

/** One batch as the AI answered it: the provider that answered, and each message with its classification. */
interface ClassifiedBatch {
  provider: ProviderName;
  pairs: ClassifiedPair[];
}

/** What a recorded batch changed, for the Gmail labels: the applications touched and the job alert threads. */
interface RecordedBatch {
  applicationIds: number[];
  alertThreadIds: string[];
}

const toMessageToClassify = (message: RetainedMessage): MessageToClassify => ({
  direction: message.direction,
  receivedAt: message.receivedAt,
  from: message.sender,
  subject: message.subject,
  snippet: message.snippet,
});

/** The items in slices of `size`, in order; the last slice holds what is left. */
const chunksOf = <T>(items: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
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

/**
 * RG-17: a message the AI read against its own wording — a polite refusal opens with an acknowledgement — is filed
 * from that wording. The correction is logged: only the identifier of the message, never its content (ENF-SEC-08).
 */
const correctFromWording =
  (logger: Logger) =>
  (pair: ClassifiedPair): ClassifiedPair => {
    const classification = applyCategoryCues(pair.message, pair.classification);
    if (classification.category === pair.classification.category) return pair;
    logger.info('classification corrected by the wording of the message', {
      gmailMessageId: pair.message.gmailMessageId,
      from: pair.classification.category,
      to: classification.category,
    });
    return { ...pair, classification };
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
 * @returns the application the message was attached to, or null.
 * @req EF-GML-08, EF-GML-09, EF-GML-10, EF-GML-11, EF-GML-12, EF-GML-19
 */
const recordMessage = async (
  tx: Executor,
  { userId, pair, provider }: { userId: number; pair: ClassifiedPair; provider: ProviderName },
): Promise<number | null> => {
  const { message, classification } = pair;
  if (classification.category === 'off_topic') return null;
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
  if (classification.category === 'job_alert') return null;
  return attachIncomingMessage(tx, {
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
): Promise<RecordedBatch> => {
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
  const applicationIds = new Set<number>();
  for (const pair of pairs) {
    const applicationId = await recordMessage(tx, { userId, pair, provider });
    if (applicationId !== null) applicationIds.add(applicationId);
  }
  const alertThreadIds = pairs
    .filter((pair) => pair.classification.category === 'job_alert')
    .map((pair) => pair.message.gmailThreadId);
  return { applicationIds: [...applicationIds], alertThreadIds };
};

/**
 * Classification and recording of the batches of one pass: the AI call of a batch, the labels of what it changed,
 * and the recording of a window of batches in their order.
 * @req EF-GML-08 to EF-GML-17, EF-GML-19, EF-CAN-11, ENF-FIA-03, ENF-PERF-02, RG-04, RG-17
 */
const createBatchPipeline = ({ db, router, clock, logger }: Omit<GmailSyncDeps, 'journal' | 'fetcher'>) => {
  const classifyBatch = async (userId: number, batch: RetainedMessage[]) => {
    const { system, prompt } = buildClassifyEmailsPrompt(batch.map(toMessageToClassify));
    const { data, provider } = await router.runTask('classify_emails', {
      userId,
      system,
      prompt,
      schema: ClassificationSchema,
    });
    return { provider, pairs: pairAnswers(batch, data.messages).map(correctFromWording(logger)) };
  };

  /** EF-GML-13 to 16: labels of what the batch changed, every thread of a touched application relabelled. */
  const labelBatch = async (
    userId: number,
    labeler: ThreadLabeler,
    recorded: RecordedBatch,
  ): Promise<void> => {
    try {
      for (const target of await findApplicationThreads(db, userId, recorded.applicationIds)) {
        await labeler.labelApplication(target);
      }
      for (const threadId of recorded.alertThreadIds) await labeler.labelJobAlert(threadId);
    } catch (error) {
      // Labels are a convenience (priority S): a Gmail refusal must not fail a synchronisation already recorded.
      logger.warn('gmail labels not applied', { error });
    }
  };

  /**
   * Records the answers of one window in the order of its batches, and labels what each one changed.
   * @returns the messages recorded; a batch the AI refused stops the window, the ones before it staying recorded.
   * @throws the failure of the first refused batch (ENF-FIA-03).
   */
  const recordWindow = async (
    userId: number,
    answers: PromiseSettledResult<ClassifiedBatch>[],
    labeler: ThreadLabeler | null,
  ): Promise<number> => {
    let classified = 0;
    for (const answer of answers) {
      if (answer.status === 'rejected') throw answer.reason;
      const { provider, pairs } = answer.value;
      const recorded = await db.transaction((tx) =>
        recordBatch(tx, { userId, pairs, provider, processedAt: clock() }),
      );
      if (labeler) await labelBatch(userId, labeler, recorded);
      classified += pairs.length;
    }
    return classified;
  };


  return { classifyBatch, recordWindow };
};

/**
 * One synchronisation of a user: incremental fetch (T-302), classification by the AI router (RG-13), storage and
 * attachment, then Gmail labels unless the user turned them off.
 * @req EF-GML-04, EF-GML-06, EF-GML-08 to EF-GML-17, EF-GML-19, EF-CAN-11, EF-CFG-01, ENF-FIA-03,
 * ENF-PERF-02, RG-17
 */
const createSyncRun = (deps: Omit<GmailSyncDeps, 'journal'>): ((userId: number) => Promise<SyncReport>) => {
  const { db, fetcher, clock, logger } = deps;
  const { classifyBatch, recordWindow } = createBatchPipeline(deps);

  const run = async (userId: number): Promise<SyncReport> => {
    const startedAt = clock();
    const { readCount, retained, mailbox, shouldApplyLabels, hasMore } =
      await fetcher.fetchNewMessages(userId);
    // EF-GML-17: read-only mode, no label is ever written.
    const labeler = shouldApplyLabels
      ? createThreadLabeler({ mailbox, cache: databaseLabelCache(db, userId) })
      : null;
    let classified = 0;
    for (const window of chunksOf(chunksOf(retained, CLASSIFY_BATCH_SIZE), CLASSIFY_CONCURRENCY)) {
      // The batches of a window are classified at once, then recorded in their order (RG-04).
      const answers = await Promise.allSettled(window.map((batch) => classifyBatch(userId, batch)));
      classified += await recordWindow(userId, answers, labeler);
    }
    // A message the AI skipped, or one the bounded pass left behind, is still unprocessed: the next pass must list
    // it again from the same date.
    const isComplete = !hasMore && classified === retained.length;
    if (isComplete) await repository.setLastSyncAt(db, userId, startedAt);
    else
      logger.warn('gmail messages left for the next synchronisation', {
        unclassified: retained.length - classified,
        hasMore,
      });
    return { read: readCount, retained: retained.length, classified, pending: !isComplete };
  };

  return run;
};

/**
 * Creates the Gmail synchronisation: one at a time per user, every execution journaled (EF-GML-18), an authorisation
 * refused by Google marked expired (Q-11).
 * @req EF-GML-03, EF-GML-04, EF-GML-18, ENF-FIA-01, Q-11
 */
export const createGmailSync = (deps: GmailSyncDeps): GmailSync => {
  const { db, journal, clock, logger } = deps;
  const run = createSyncRun(deps);
  const running = new Set<number>();

  const runOnce = async (userId: number): Promise<SyncReport> => {
    try {
      return await run(userId);
    } catch (error) {
      if (isRateLimited(error)) throw new GmailQuotaExceededError();
      if (!isInvalidGrant(error)) throw error;
      await repository.markAuthorizationExpired(db, userId, clock());
      throw new GmailAuthorizationExpiredError();
    }
  };

  const synchronise = async (userId: number, trigger: TriggerType): Promise<SyncReport> => {
    const entry = { userId, job: 'gmail_sync' as const, trigger };
    if (running.has(userId)) {
      await journal.recordSkipped(entry);
      throw new SyncAlreadyRunningError();
    }
    running.add(userId);
    try {
      return await journal.record(entry, () => runOnce(userId), countersOf);
    } finally {
      running.delete(userId);
    }
  };

  return {
    synchronise,
    async synchroniseEveryMailbox() {
      for (const userId of await repository.listSyncableUserIds(db)) {
        try {
          await synchronise(userId, 'schedule');
        } catch (error) {
          // A pass already running is the lock doing its work (EF-GML-18), not a failure of the scheduled run.
          if (error instanceof SyncAlreadyRunningError) {
            logger.info('scheduled gmail synchronisation skipped, one is already running', { userId });
          } else logger.warn('scheduled gmail synchronisation failed', { userId, error });
        }
      }
    },
  };
};
