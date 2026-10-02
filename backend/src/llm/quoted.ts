import { statusOfError } from '../lib/httpStatus.js';

/** What the log says in place of a failure message that quoted the request (ENF-RGP-12). */
export const QUOTED_REQUEST = 'the message quoted the request and was withheld';

// Characters in a row that, found in the request, make a message a quote of it: a few words by chance are not.
const QUOTE_WINDOW = 24;

const quotes = (message: string, requests: readonly string[]): boolean => {
  for (let start = 0; start + QUOTE_WINDOW <= message.length; start += 1) {
    const piece = message.slice(start, start + QUOTE_WINDOW);
    if (requests.some((request) => request.includes(piece))) return true;
  }
  return false;
};

/**
 * ENF-RGP-12: the failure of a provider, safe to write in a log. A service sometimes quotes what it was sent in its
 * error — the JSON it could not read, the text that was too long — and what it was sent is the text of a CV, of an
 * offer, of a prompt. A message that quotes the request, even in part, is replaced by a fixed sentence; the kind of
 * failure and its HTTP status, which are what a log is read for, stay. Any other failure is handed back as it is.
 * @req ENF-RGP-12
 */
export const withoutQuotedRequest = (error: unknown, requests: readonly string[]): unknown => {
  if (!(error instanceof Error) || !quotes(error.message, requests)) return error;
  const status = statusOfError(error);
  return Object.assign(new Error(QUOTED_REQUEST), {
    name: error.name,
    ...(status === null ? {} : { status }),
  });
};
