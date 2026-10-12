import { describe, expect, it, vi } from 'vitest';
import { createResendClient, RESEND_TIMEOUT_MS } from './resendClient.js';

const MESSAGE = { to: 'alex@example.com', subject: 'Activez votre compte Tracandi', html: '<p>Bonjour</p>' };

const clientWith = (fetchImpl: typeof fetch) =>
  createResendClient({ apiKey: 're_test_key', from: 'onboarding@resend.dev', fetchImpl });

describe('createResendClient', () => {
  it('[EF-AUT-14] posts the message to the Resend API with the key in the Authorization header', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })),
    );

    await clientWith(fetchImpl).send(MESSAGE);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'onboarding@resend.dev',
      to: MESSAGE.to,
      subject: MESSAGE.subject,
      html: MESSAGE.html,
    });
  });

  it('[ENF-RGP-15] sends only the recipient, the subject and the html body — nothing else', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })),
    );

    await clientWith(fetchImpl).send(MESSAGE);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.keys(JSON.parse(String(init.body)) as object).sort()).toEqual([
      'from',
      'html',
      'subject',
      'to',
    ]);
  });

  it('[ENF-SEC-03] never carries the key in the address', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })),
    );

    await clientWith(fetchImpl).send(MESSAGE);

    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('re_test_key');
  });

  it('fails with the service’s own (truncated) message on a refusal', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'Invalid `from` field' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(clientWith(fetchImpl).send(MESSAGE)).rejects.toThrow(/Invalid `from` field/);
  });

  it('fails when the service answers outside its own format, without throwing on a malformed body', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    );

    await expect(clientWith(fetchImpl).send(MESSAGE)).rejects.toThrow(/Resend:/);
  });

  it('never redirects a request (ENF-SEC-25-style defence against a rewritten endpoint)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 'abc' }), { status: 200 })),
    );

    await clientWith(fetchImpl).send(MESSAGE);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.redirect).toBe('error');
  });

  it('[EF-AUT-14] gives up after 10 seconds on a service that does not answer', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError')));
        }),
    );

    const pending = clientWith(fetchImpl as unknown as typeof fetch)
      .send(MESSAGE)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RESEND_TIMEOUT_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toBeInstanceOf(DOMException);
    expect(RESEND_TIMEOUT_MS).toBe(10_000);
    vi.useRealTimers();
  });

  it('[ENF-SEC-08] redacts an e-mail address from the refusal message', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: 'You can only send testing emails to your own email address (owner@example.com).',
          }),
          { status: 403 },
        ),
      ),
    );

    const failure = await clientWith(fetchImpl).send(MESSAGE).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/Resend: You can only send testing emails/);
    expect((failure as Error).message).not.toContain('owner@example.com');
  });
});
