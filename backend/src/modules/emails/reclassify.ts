import type { Database } from '../../db/client.js';
import type { RunCounters } from '../../jobs/queue.js';
import { mapWithConcurrency } from '../../lib/async.js';
import type { Logger } from '../../lib/logger.js';
import { applyReclassifiedMessage, findApplicationThreads } from '../applications/service.js';
import { hasRejectionCue } from './cues.js';
import type { MessageFetcher } from './fetcher.js';
import { createThreadLabeler, databaseLabelCache } from './labels.js';
import type { GmailMailbox } from './mailbox.js';
import * as repository from './repository.js';
import type { StoredMessage } from './repository.js';

// ENF-PERF-02: messages read at once; the quota governor of the mailbox spaces the calls (ENF-FIA-09).
const READ_CONCURRENCY = 10;

interface ReclassificationDeps {
  db: Database;
  fetcher: MessageFetcher;
  logger: Logger;
}

/** One reading again of a user's acknowledgements, reporting its counters as it goes (EF-EXE-03). */
export type ReclassificationRun = (
  userId: number,
  report: (counters: RunCounters) => void,
) => Promise<RunCounters>;

/**
 * RG-17 on the message as Gmail gives it now, with the start of its body (T-307).
 * @returns true for a refusal; null when Gmail no longer holds the message.
 */
const refusesNow = async (mailbox: GmailMailbox, stored: StoredMessage): Promise<boolean | null> => {
  const message = await mailbox.getMessage(stored.gmailMessageId);
  if (!message) return null;
  return hasRejectionCue({ subject: stored.subject, snippet: stored.snippet ?? '', text: message.text });
};

/**
 * Creates the reading again of the received messages stored as acknowledgements (EF-GML-20): each is read in Gmail,
 * and the ones RG-17 now reads as refusals are refiled « refus », their application following RG-04 in the same
 * transaction; the threads of the applications touched are relabelled unless labels are off (EF-GML-17). No AI is
 * called. A message corrected stays corrected if the run stops later (quota, outage): nothing is redone twice.
 * The body is read in memory only, never stored nor logged (ENF-RGP-01, ENF-SEC-08).
 * @throws GmailNotConnectedError when no mailbox is connected; any Gmail failure, including a quota refusal.
 * @req EF-GML-20, RG-17, RG-04, EF-GML-13, EF-GML-14, EF-GML-17, ENF-RGP-01
 */
export const createReclassification =
  ({ db, fetcher, logger }: ReclassificationDeps): ReclassificationRun =>
  async (userId, report) => {
    const { mailbox, shouldApplyLabels } = await fetcher.openMailbox(userId);
    const acknowledgements = await repository.listReceivedEmails(db, userId, 'acknowledged');
    let read = 0;
    let corrected = 0;

    const reclassify = async (stored: StoredMessage): Promise<number | null> => {
      const refuses = await refusesNow(mailbox, stored);
      if (refuses !== null) read += 1;
      if (!refuses) return null;
      const applicationId = await db.transaction(async (tx) => {
        await repository.setEmailCategory(tx, stored.id, 'rejected');
        return applyReclassifiedMessage(tx, { userId, emailId: stored.id });
      });
      corrected += 1;
      logger.info('acknowledgement refiled as a refusal', { gmailMessageId: stored.gmailMessageId });
      report({ messages_read: read, messages_corrected: corrected });
      return applicationId;
    };

    const touched = await mapWithConcurrency(acknowledgements, READ_CONCURRENCY, reclassify);
    const applicationIds = [...new Set(touched.filter((id): id is number => id !== null))];
    if (shouldApplyLabels && applicationIds.length > 0) {
      const labeler = createThreadLabeler({ mailbox, cache: databaseLabelCache(db, userId) });
      try {
        for (const target of await findApplicationThreads(db, userId, applicationIds)) {
          await labeler.labelApplication(target);
        }
      } catch (error) {
        // Labels are a convenience (priority S): the corrections are already recorded.
        logger.warn('gmail labels not applied', { error });
      }
    }
    return { messages_read: read, messages_corrected: corrected };
  };
