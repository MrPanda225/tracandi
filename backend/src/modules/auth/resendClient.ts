import { z } from 'zod';
import { withoutContacts } from '../../scraper/contacts.js';

const ERROR_EXCERPT_LENGTH = 300;
/** A hanging Resend must not hang the registration request (EF-AUT-14). */
export const RESEND_TIMEOUT_MS = 10_000;
const RESEND_API_URL = 'https://api.resend.com/emails';

// External data: the answer of the service is parsed before use (clean-code.md).
const ErrorAnswerSchema = z.object({ message: z.string().nullish() }).nullish();

/** The message of a refusal, as the service words it; its body is short and holds no prompt. */
const describeFailure = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '');
  const parsed = ErrorAnswerSchema.safeParse(
    ((): unknown => {
      try {
        return JSON.parse(body) as unknown;
      } catch {
        return undefined;
      }
    })(),
  );
  const message = parsed.success ? parsed.data?.message : undefined;
  // ENF-SEC-08: the refusal may quote the recipient address; the message ends up in the logs.
  return withoutContacts(message ?? body).slice(0, ERROR_EXCERPT_LENGTH);
};

/** One e-mail to send: recipient, subject and HTML body, composed by the caller (ENF-RGP-15). */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/** Sends a single e-mail; injected into the services that need one (testing.md). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface ResendClientDeps {
  apiKey: string;
  /** Verified sender address of the Business Owner's Resend account (C-11). */
  from: string;
  /** Injected so that tests never reach the network (testing.md). */
  fetchImpl?: typeof fetch;
}

/**
 * Resend client, limited to sending one e-mail (`POST /emails`): no SDK dependency, the same `fetch` pattern as
 * `llm/providers/openaiCompatible.ts`. Sends only the recipient address and the message prepared by the caller,
 * never the password nor any other account datum (ENF-RGP-15).
 * @throws Error with the service's own (truncated) refusal message; never logs the request or response body.
 * @req EF-AUT-14, ENF-RGP-15, C-11
 */
export const createResendClient = ({ apiKey, from, fetchImpl = fetch }: ResendClientDeps): Mailer => ({
  async send({ to, subject, html }) {
    // An AbortController with a timer rather than `AbortSignal.timeout`, whose internal timer fake clocks cannot drive.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException('Resend did not answer in time', 'TimeoutError'));
    }, RESEND_TIMEOUT_MS);
    try {
      const response = await fetchImpl(RESEND_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Resend: ${await describeFailure(response)}`);
      // The body (a message id) carries nothing useful here; draining it lets the connection be reused.
      await response.body?.cancel().catch(() => undefined);
    } finally {
      clearTimeout(timer);
    }
  },
});
