import type { Database } from '../../db/client.js';
import { mapWithConcurrency } from '../../lib/async.js';
import type { Clock } from '../../lib/clock.js';
import { decryptSecret } from '../../lib/crypto.js';
import { HttpError } from '../../lib/errors.js';
import { normalizeKey } from '../../lib/text.js';
import type { GmailMailbox, MailboxMessage, OpenMailbox } from './mailbox.js';
import { isRateLimited } from './quota.js';
import {
  createPrefilter,
  DEFAULT_JOB_KEYWORDS,
  KNOWN_PLATFORMS,
  type PlatformRef,
  type PrefilterLists,
} from './prefilter.js';
import * as repository from './repository.js';

/** No mailbox is connected: there is nothing to synchronise (409). */
export class GmailNotConnectedError extends HttpError {
  constructor() {
    super(409, 'Aucune boîte Gmail n’est connectée : connectez-la depuis les Réglages.');
  }
}

/** A new message kept by the pre-filter, with the known platform of its sender (EF-GML-10). */
export interface RetainedMessage extends MailboxMessage {
  platform: PlatformRef | null;
}

export interface FetchResult {
  /** New messages read in the mailbox (EF-GML-04, « lus »). */
  readCount: number;
  /**
   * New messages kept by RG-10, oldest first (RG-04 order). They are not marked processed yet: the classification
   * does it, so that an interruption before it leaves them to the next pass (ENF-FIA-03).
   */
  retained: RetainedMessage[];
  /** The opened mailbox, for the labels of the same pass (T-304). */
  mailbox: GmailMailbox;
  /** EF-GML-17: false when the user turned the writing of labels off. */
  shouldApplyLabels: boolean;
  /**
   * True when the pass left messages behind: it reached `MAX_MESSAGES_PER_PASS`, or Gmail's quota stopped it.
   * The date of the last synchronisation must not move, so that the next pass lists them again (ENF-FIA-03).
   */
  hasMore: boolean;
}

/** An opened mailbox and whether the user lets Tracandi write its labels (EF-GML-17). */
export interface OpenedMailbox {
  mailbox: GmailMailbox;
  shouldApplyLabels: boolean;
}

export interface MessageFetcher {
  /**
   * Opens the mailbox of the user, to read stored messages again (EF-GML-20).
   * @throws GmailNotConnectedError when no mailbox is connected.
   */
  openMailbox: (userId: number) => Promise<OpenedMailbox>;
  /**
   * Reads the messages received and sent since the last synchronisation (N days back for the first one), skips the
   * known ones, and marks the messages set aside by RG-10 as processed, without any AI call.
   * @throws GmailNotConnectedError when no mailbox is connected; Gmail's quota refusal when not a single message
   * could be read; any other Gmail or database failure, nothing being recorded twice on the next pass (ENF-FIA-03).
   */
  fetchNewMessages: (userId: number) => Promise<FetchResult>;
}

interface MessageFetcherDeps {
  db: Database;
  openMailbox: OpenMailbox;
  encryptionKey: Buffer;
  clock: Clock;
}

const DAY_MS = 24 * 60 * 60_000;
const MS_PER_SECOND = 1000;
// Gmail indexes a message shortly after its arrival: the last hour is read again, known messages skipped (EF-GML-06).
export const SYNC_OVERLAP_MS = 60 * 60_000;
// ENF-PERF-02; the quota governor of the mailbox spaces these calls (GMAIL_UNITS_PER_SECOND, 5 per read).
const READ_CONCURRENCY = 10;
/**
 * Messages read in one pass. The first synchronisation of a mailbox covers N days and may list thousands of
 * messages: they are read over several passes, each one short enough for the manual synchronisation to answer and
 * for Gmail's quota per minute to hold. The messages read are marked processed, so a pass never redoes the previous
 * one (ENF-FIA-03).
 */
export const MAX_MESSAGES_PER_PASS = 200;

/**
 * Instant from which messages are read: one overlap before the last synchronisation, or N days back for the first.
 * @req EF-GML-05, EF-GML-06
 */
export const readSince = (lastSyncAt: Date | null, lookbackDays: number, now: Date): Date =>
  lastSyncAt
    ? new Date(lastSyncAt.getTime() - SYNC_OVERLAP_MS)
    : new Date(now.getTime() - lookbackDays * DAY_MS);

// Gmail reads `after:` as seconds since the epoch; drafts are not messages of the candidate yet.
const searchSince = (since: Date): string =>
  `after:${Math.floor(since.getTime() / MS_PER_SECOND)} -in:drafts`;

const byReceptionDate = (a: MailboxMessage, b: MailboxMessage): number =>
  a.receivedAt.getTime() - b.receivedAt.getTime() || a.gmailMessageId.localeCompare(b.gmailMessageId);

/**
 * Loader of the RG-10 lists of a user. A user without keywords gets the initial list, then keeps their own (Q-09);
 * the known platforms, a shared reference, are recorded once per loader, then read.
 * @req RG-10, Q-09
 */
const createListsLoader = (db: Database): ((userId: number) => Promise<PrefilterLists>) => {
  let arePlatformsSaved = false;

  const keywordsOf = async (userId: number): Promise<readonly string[]> => {
    const keywords = await repository.findPrefilterKeywords(db, userId);
    if (keywords.length > 0) return keywords;
    await repository.insertPrefilterKeywords(db, userId, DEFAULT_JOB_KEYWORDS);
    return DEFAULT_JOB_KEYWORDS;
  };

  const platformDomains = async (): Promise<Map<string, PlatformRef>> => {
    if (!arePlatformsSaved) {
      const known = KNOWN_PLATFORMS.map((platform) => ({
        ...platform,
        nameKey: normalizeKey(platform.name),
      }));
      await repository.saveKnownPlatforms(db, known);
      arePlatformsSaved = true;
    }
    return repository.findPlatformDomains(db);
  };

  return async (userId) => {
    const [keywords, domains] = await Promise.all([keywordsOf(userId), platformDomains()]);
    return { keywords, platformDomains: domains };
  };
};

/**
 * Reads the messages of one pass, at most READ_CONCURRENCY at a time.
 * Gmail's quota may be spent although the calls were spaced and attempted again: the reading then stops and the
 * pass keeps what it holds, the rest waiting for the next one.
 * @returns the messages read, deleted ones as null, and whether Gmail refused the rest for quota.
 * @throws the quota refusal when not a single message could be read; any other Gmail failure.
 * @req ENF-FIA-03, ENF-FIA-09, ENF-PERF-02
 */
const readMessages = async (
  mailbox: GmailMailbox,
  ids: readonly string[],
): Promise<{ read: (MailboxMessage | null)[]; isQuotaSpent: boolean }> => {
  let quotaRefusal: unknown = null;
  const read = await mapWithConcurrency(ids, READ_CONCURRENCY, async (id) => {
    if (quotaRefusal) return null;
    try {
      return await mailbox.getMessage(id);
    } catch (error) {
      if (!isRateLimited(error)) throw error;
      quotaRefusal = error;
      return null;
    }
  });
  // Nothing at all could be read: the user is told, rather than shown an empty synchronisation.
  if (quotaRefusal && read.every((message) => message === null)) throw quotaRefusal;
  return { read, isQuotaSpent: quotaRefusal !== null };
};

/**
 * Creates the fetcher of new Gmail messages: incremental listing, exclusion of the processed ones, metadata and
 * excerpt only, RG-10 pre-filter.
 * @req EF-GML-05, EF-GML-06, EF-GML-07, ENF-RGP-01, ENF-FIA-03, ENF-FIA-09, RG-10
 */
export const createMessageFetcher = ({
  db,
  openMailbox,
  encryptionKey,
  clock,
}: MessageFetcherDeps): MessageFetcher => {
  const listsOf = createListsLoader(db);

  const sourceOf = async (userId: number) => {
    const source = await repository.findSyncSource(db, userId);
    if (!source) throw new GmailNotConnectedError();
    return { source, mailbox: openMailbox(decryptSecret(source.refreshToken, encryptionKey)) };
  };

  return {
    async openMailbox(userId) {
      const { source, mailbox } = await sourceOf(userId);
      return { mailbox, shouldApplyLabels: source.shouldApplyLabels };
    },

    async fetchNewMessages(userId) {
      const { source, mailbox } = await sourceOf(userId);
      const now = clock();
      const since = readSince(source.lastSyncAt, source.lookbackDays, now);

      const [listed, lists] = await Promise.all([
        mailbox.listMessageIds(searchSince(since)),
        listsOf(userId),
      ]);
      const unique = [...new Set(listed)];
      const known = await repository.findProcessedMessageIds(db, userId, unique);
      // Gmail lists the newest messages first: a bounded pass reads those, the older ones wait for the next one.
      const unread = unique.filter((id) => !known.has(id));
      const toRead = unread.slice(0, MAX_MESSAGES_PER_PASS);
      const { read, isQuotaSpent } = await readMessages(mailbox, toRead);
      // EF-GML-05: the search bounds the listing, the date of each message decides.
      const messages = read.filter(
        (message): message is MailboxMessage => message !== null && message.receivedAt >= since,
      );

      const prefilter = createPrefilter(lists);
      const isKept = new Map(messages.map((message) => [message, prefilter.isRetained(message)]));
      await repository.insertProcessedMessages(db, {
        userId,
        gmailMessageIds: messages
          .filter((message) => !isKept.get(message))
          .map((message) => message.gmailMessageId),
        outcome: 'prefiltered',
        processedAt: now,
      });
      const retained = messages
        .filter((message) => isKept.get(message))
        .sort(byReceptionDate)
        .map((message) => ({ ...message, platform: prefilter.platformOf(message.fromAddress) }));
      return {
        readCount: messages.length,
        retained,
        mailbox,
        shouldApplyLabels: source.shouldApplyLabels,
        hasMore: unread.length > toRead.length || isQuotaSpent,
      };
    },
  };
};
