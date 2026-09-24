import type { Database } from '../../db/client.js';
import type { RunCounters } from '../../jobs/queue.js';
import { mapWithConcurrency } from '../../lib/async.js';
import type { Logger } from '../../lib/logger.js';
import { applyReclassifiedMessage, findApplicationThreads } from '../applications/service.js';
import { hasRejectionCue } from './cues.js';
import { contactAddressOf } from './domains.js';
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

/** What reading a stored message again teaches: whether it refuses (RG-17), and its contact address (RG-20). */
interface Reading {
  refuses: boolean;
  contactAddress: string | null;
}

/**
 * The message as Gmail gives it now, with the start of its body (T-307): RG-17 for an acknowledgement, RG-20 for a
 * message still without contact address.
 * @returns null when Gmail no longer holds the message.
 */
const readAgain = async (mailbox: GmailMailbox, stored: StoredMessage): Promise<Reading | null> => {
  const message = await mailbox.getMessage(stored.gmailMessageId);
  if (!message) return null;
  return {
    refuses:
      stored.category === 'acknowledged' &&
      message.direction === 'inbound' &&
      hasRejectionCue({ subject: stored.subject, snippet: stored.snippet ?? '', text: message.text }),
    contactAddress: stored.contactAddress === null ? contactAddressOf(message) : null,
  };
};

/** Each stored message once, whichever list brought it: a message is read in Gmail a single time. */
const uniqueById = (lists: readonly StoredMessage[][]): StoredMessage[] => [
  ...new Map(lists.flat().map((stored) => [stored.id, stored])).values(),
];

/**
 * Creates the reading again of the stored messages (EF-GML-20): the received acknowledgements, and the messages
 * still without contact address (RG-20). Each is read in Gmail once; the acknowledgements RG-17 now reads as refusals
 * are refiled « refus », their application following RG-04 in the same transaction, and the contact address found
 * is kept; the threads of the applications touched are relabelled unless labels are off (EF-GML-17). No AI is
 * called. A message corrected stays corrected if the run stops later (quota, outage): nothing is redone twice.
 * The body is read in memory only, never stored nor logged (ENF-RGP-01, ENF-SEC-08).
 * @throws GmailNotConnectedError when no mailbox is connected; any Gmail failure, including a quota refusal.
 * @req EF-GML-20, RG-17, RG-20, RG-04, EF-GML-13, EF-GML-14, EF-GML-17, ENF-RGP-01
 */
export const createReclassification =
  ({ db, fetcher, logger }: ReclassificationDeps): ReclassificationRun =>
  async (userId, report) => {
    const { mailbox, shouldApplyLabels } = await fetcher.openMailbox(userId);
    const toRead = uniqueById(
      await Promise.all([
        repository.listReceivedEmails(db, userId, 'acknowledged'),
        repository.listEmailsWithoutContact(db, userId),
      ]),
    );
    let read = 0;
    let corrected = 0;

    const reclassify = async (stored: StoredMessage): Promise<number | null> => {
      const reading = await readAgain(mailbox, stored);
      if (!reading) return null;
      read += 1;
      const { refuses, contactAddress } = reading;
      const applicationId = await db.transaction(async (tx) => {
        if (contactAddress) await repository.setEmailContact(tx, stored.id, contactAddress);
        if (!refuses) return null;
        await repository.setEmailCategory(tx, stored.id, 'rejected');
        return applyReclassifiedMessage(tx, { userId, emailId: stored.id });
      });
      if (refuses) {
        corrected += 1;
        logger.info('acknowledgement refiled as a refusal', { gmailMessageId: stored.gmailMessageId });
      }
      report({ messages_read: read, messages_corrected: corrected });
      return applicationId;
    };

    const touched = await mapWithConcurrency(toRead, READ_CONCURRENCY, reclassify);
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
