/** A reply to write as a Gmail draft (EF-CAN-17). */
export interface Reply {
  to: string;
  subject: string;
  /** `Message-ID` of the message answered, null when the thread gives none. */
  inReplyTo: string | null;
  /** `Message-ID` of every message of the thread, oldest first (RFC 5322 §3.6.4). */
  references: readonly string[];
  body: string;
}

const REPLY_PREFIX = /^\s*re\s*:/i;
// RFC 2045 §6.8: base64 lines of at most 76 characters.
const BASE64_LINE = /.{1,76}/g;
const NON_ASCII = /[^\x20-\x7e]/;

/**
 * The subject of a reply: the thread's own, prefixed once with « Re: », so that Gmail keeps the draft in the thread;
 * without subject, one naming the application.
 * @req EF-CAN-17
 */
export const replySubjectOf = (threadSubject: string | null, jobTitle = 'votre offre'): string => {
  const subject = threadSubject?.trim();
  if (!subject) return `Relance — candidature ${jobTitle}`;
  return REPLY_PREFIX.test(subject) ? subject : `Re: ${subject}`;
};

/**
 * A header value on one line: every line break becomes a space (ENF-SEC-04). The recipient and the subject come
 * from received messages; a break in them would otherwise add a header, a hidden copy for instance.
 */
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim();

/** RFC 2047: a header holding anything but printable ASCII is written as an encoded word. */
const encodeHeader = (value: string): string =>
  NON_ASCII.test(value) ? `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=` : value;

/**
 * The RFC 2822 message of a reply, plain text in UTF-8, body in base64: what Gmail's `drafts.create` receives, once
 * base64url-encoded. No `From`: Gmail sets the address of the mailbox. Header values are kept on one line.
 * @req EF-CAN-17, ENF-SEC-04
 */
export const buildReplyMessage = (reply: Reply): string => {
  const headers = [
    `To: ${oneLine(reply.to)}`,
    `Subject: ${encodeHeader(oneLine(reply.subject))}`,
    ...(reply.inReplyTo ? [`In-Reply-To: ${oneLine(reply.inReplyTo)}`] : []),
    ...(reply.references.length > 0 ? [`References: ${reply.references.map(oneLine).join(' ')}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  const body = Buffer.from(reply.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64');
  return `${headers.join('\r\n')}\r\n\r\n${(body.match(BASE64_LINE) ?? []).join('\r\n')}`;
};
