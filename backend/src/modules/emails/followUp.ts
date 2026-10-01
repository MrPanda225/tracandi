import { z } from 'zod';
import type { Database } from '../../db/client.js';
import type { Clock } from '../../lib/clock.js';
import { HttpError, NotFoundError } from '../../lib/errors.js';
import type { Logger } from '../../lib/logger.js';
import { buildWriteFollowUpPrompt } from '../../llm/prompts/writeFollowUp.js';
import type { LlmRouter } from '../../llm/router.js';
import { isNoReplyAddress } from './domains.js';
import type { MessageFetcher } from './fetcher.js';
import { isInvalidGrant } from './mailbox.js';
import { isRateLimited } from './quota.js';
import { buildReplyMessage, replySubjectOf } from './replyMessage.js';
import * as repository from './repository.js';
import { GmailAuthorizationExpiredError, GmailQuotaExceededError } from './sync.js';

// EF-CAN-17: bounds of the follow-up the code checks, not the model (skill add-llm-task).
const MIN_WORDS = 80;
const MAX_WORDS = 150;
const BODY_MAX_LENGTH = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/';

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/**
 * Output of the `write_follow_up` task (prompt `llm/prompts/writeFollowUp.ts`): an answer outside 80 to 150 words is
 * refused, and the next provider tries (EF-IA-02).
 * @req EF-CAN-17, EF-IA-03
 */
export const FollowUpDraftSchema = z.object({
  body: z
    .string()
    .trim()
    .max(BODY_MAX_LENGTH)
    .refine((body) => {
      const words = wordCount(body);
      return words >= MIN_WORDS && words <= MAX_WORDS;
    }, `between ${MIN_WORDS} and ${MAX_WORDS} words`),
});

/** RG-20: nobody to write to for this application (409). */
export class NoContactError extends HttpError {
  constructor() {
    super(
      409,
      'Aucune adresse à laquelle écrire pour cette candidature : la relance ne peut pas être préparée.',
    );
  }
}

/** RG-06: the application waits for an answer to nothing (interview, offer, refusal, to apply) (409). */
export class NotFollowedUpError extends HttpError {
  constructor() {
    super(
      409,
      'Cette candidature n’attend pas de relance : seules les candidatures envoyées ou accusées en ont une.',
    );
  }
}

/** A draft saved in Gmail (EF-CAN-17): where it opens, and to whom it is written. */
export interface FollowUpDraft {
  draftUrl: string;
  to: string;
  subject: string;
}

export interface FollowUpDrafts {
  /**
   * EF-CAN-17: writes the follow-up of one application of the user with the AI (route RG-13) and saves it as a
   * Gmail draft, a reply in the thread of its contact (RG-20). Nothing is ever sent.
   * @throws NotFoundError (404) when the application is absent or another user's; NotFollowedUpError or
   * NoContactError (409); GmailNotConnectedError or GmailAuthorizationExpiredError (409); GmailQuotaExceededError
   * (503); LlmUnavailableError (502) when no provider wrote an acceptable text.
   */
  draft: (userId: number, applicationId: number) => Promise<FollowUpDraft>;
}

interface FollowUpDraftsDeps {
  db: Database;
  fetcher: MessageFetcher;
  router: LlmRouter;
  clock: Clock;
  logger: Logger;
}

/** Gmail opens a draft from its message id; `authuser` picks the connected account among the signed-in ones. */
const draftUrlOf = (accountAddress: string | null, draftMessageId: string): string =>
  `${GMAIL_DRAFTS_URL}${accountAddress ? `?authuser=${encodeURIComponent(accountAddress)}` : ''}` +
  `#drafts?compose=${encodeURIComponent(draftMessageId)}`;

/**
 * The facts of the application and its contact, once RG-06 and RG-20 allow a follow-up.
 * @throws NotFoundError, NotFollowedUpError, NoContactError
 */
const findFollowedUp = async (db: Database, userId: number, applicationId: number) => {
  const context = await repository.findFollowUpContext(db, userId, applicationId);
  if (!context) throw new NotFoundError('Candidature introuvable');
  const { status } = context;
  if (status !== 'sent' && status !== 'acknowledged') throw new NotFollowedUpError();
  // RG-20: a no-reply address stored before the rule was refined is passed over, not written to.
  const contact = context.contacts.find(({ address }) => !isNoReplyAddress(address));
  if (!contact) throw new NoContactError();
  return { ...context, status, contact };
};

/**
 * Creates the follow-up drafts (EF-CAN-17). The body of no message is read or sent to the AI: only the facts of the
 * application (ENF-RGP-01); the draft is never sent (§5.2: the candidate follows up himself).
 * @req EF-CAN-17, RG-06, RG-20, RG-13, ENF-SEC-06
 */
export const createFollowUpDrafts = ({
  db,
  fetcher,
  router,
  clock,
  logger,
}: FollowUpDraftsDeps): FollowUpDrafts => {
  const prepare = async (userId: number, applicationId: number): Promise<FollowUpDraft> => {
    const application = await findFollowedUp(db, userId, applicationId);
    const { mailbox } = await fetcher.openMailbox(userId);
    const thread = await mailbox.threadMessages(application.contact.gmailThreadId);
    const { data } = await router.runTask('write_follow_up', {
      userId,
      ...buildWriteFollowUpPrompt({
        company: application.company,
        jobTitle: application.jobTitle,
        appliedAt: application.appliedAt,
        status: application.status,
        daysSinceActivity: Math.floor((clock().getTime() - application.lastActivityAt.getTime()) / DAY_MS),
        candidateName: thread.find((message) => message.isSent)?.senderName ?? null,
        offerDescription: application.offerDescription,
      }),
      schema: FollowUpDraftSchema,
    });
    const messageIds = thread.map((message) => message.messageId).filter((id): id is string => id !== null);
    const subject = replySubjectOf(thread.at(-1)?.subject ?? null, application.jobTitle);
    const draftMessageId = await mailbox.createDraft({
      threadId: application.contact.gmailThreadId,
      raw: Buffer.from(
        buildReplyMessage({
          to: application.contact.address,
          subject,
          inReplyTo: messageIds.at(-1) ?? null,
          references: messageIds,
          body: data.body,
        }),
        'utf8',
      ).toString('base64url'),
    });
    const account = await repository.findGmailAccount(db, userId);
    logger.info('follow-up draft saved', { applicationId });
    return {
      draftUrl: draftUrlOf(account?.emailAddress ?? null, draftMessageId),
      to: application.contact.address,
      subject,
    };
  };

  return {
    async draft(userId, applicationId) {
      try {
        return await prepare(userId, applicationId);
      } catch (error) {
        if (isRateLimited(error)) throw new GmailQuotaExceededError();
        if (!isInvalidGrant(error)) throw error;
        await repository.markAuthorizationExpired(db, userId, clock());
        throw new GmailAuthorizationExpiredError();
      }
    },
  };
};
