import { decodeHtmlEntities } from '../../lib/html.js';

/**
 * ENF-RGP-01, ENF-COU-01: characters of the body read for the classification (RG-17 cues, AI extract), in memory
 * only: never stored nor logged.
 */
export const BODY_TEXT_MAX_LENGTH = 2000;

/** A part of a message as Gmail gives it in format `full` (RFC 2045 MIME tree). */
export interface MessagePart {
  mimeType?: string | null;
  filename?: string | null;
  headers?: { name?: string | null; value?: string | null }[] | null;
  body?: { data?: string | null; attachmentId?: string | null } | null;
  parts?: MessagePart[] | null;
}

// Whatever holds no wording of the message: its head, styles and scripts, and the messages a reply quotes.
const HIDDEN_BLOCKS = /<(head|style|script|blockquote)\b[\s\S]*?<\/\1\s*>/gi;
// A block-level tag ends a line; anything else simply disappears.
const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|td)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;
const CHARSET = /charset="?([^";\s]+)"?/i;
// The line that opens the quote of a previous message, in French and English mail clients.
const QUOTE_OPENING =
  /^\s*(?:le .+ a écrit\s*:|on .+ wrote:|-{2,}\s*(?:original message|message d'origine))/i;

/** The first characters of a text, counted in Unicode characters. */
const clip = (text: string, maxLength: number): string => Array.from(text).slice(0, maxLength).join('');

/** Readable parts of the tree, depth first; an attachment is never one (its content is not the message). */
const leavesOf = (part: MessagePart): MessagePart[] =>
  part.parts?.length ? part.parts.flatMap(leavesOf) : [part];

const isReadable = (part: MessagePart): boolean =>
  !part.filename && !part.body?.attachmentId && Boolean(part.body?.data);

/** Gmail encodes a body in base64url, in the charset of its part (UTF-8 unless the part says otherwise). */
const decode = (part: MessagePart): string => {
  const bytes = Buffer.from(part.body?.data ?? '', 'base64url');
  const contentType = part.headers?.find((header) => header.name?.toLowerCase() === 'content-type')?.value;
  const charset = CHARSET.exec(contentType ?? '')?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // A charset label the runtime does not know (RangeError): the text is read as UTF-8 rather than lost.
    return new TextDecoder('utf-8').decode(bytes);
  }
};

const htmlToLines = (html: string): string =>
  decodeHtmlEntities(html.replace(HIDDEN_BLOCKS, ' ').replace(BLOCK_TAGS, '\n').replace(ANY_TAG, ' '));

/** The lines a reply writes itself, before the quote of the previous messages. */
const ownLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const quoteAt = lines.findIndex((line) => QUOTE_OPENING.test(line));
  return (quoteAt === -1 ? lines : lines.slice(0, quoteAt)).filter(
    (line) => !line.trimStart().startsWith('>'),
  );
};

/**
 * The start of the body of a message as plain text: its `text/plain` part, else its `text/html` part without tags,
 * styles nor entities; the messages a reply quotes and the attachments are left out; spaces collapsed; at most
 * BODY_TEXT_MAX_LENGTH characters. Empty when the message has no readable body.
 * @req EF-GML-08, RG-17, ENF-RGP-01
 */
export const bodyTextOf = (payload: MessagePart | null | undefined): string => {
  const readable = payload ? leavesOf(payload).filter(isReadable) : [];
  const plain = readable.find((part) => part.mimeType?.toLowerCase() === 'text/plain');
  const html = readable.find((part) => part.mimeType?.toLowerCase() === 'text/html');
  const text = plain ? decode(plain) : html ? htmlToLines(decode(html)) : '';
  return clip(ownLines(text).join(' ').replace(/\s+/g, ' ').trim(), BODY_TEXT_MAX_LENGTH);
};
