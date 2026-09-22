import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, UNREACHABLE_MESSAGE } from './client';

const jsonResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('[ENF-SEC-12] sends writes as JSON with the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await request<{ id: number }>('/applications', { method: 'POST', body: { a: 1 } });

    expect(result).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith('/api/applications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
      signal: undefined,
    });
  });

  it('[ENF-SEC-12] declares a body-less write as JSON too (logout)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await request('/auth/logout', { method: 'POST' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: { 'Content-Type': 'application/json' } });
  });

  it('[ENF-UTI-03] turns a network failure into a readable « API injoignable » error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(request('/health')).rejects.toEqual(new ApiError(0, UNREACHABLE_MESSAGE));
  });

  it('[ENF-SEC-04] exposes the French message and field details of an API error', async () => {
    const body = {
      error: 'Données invalides',
      details: [{ path: 'body.email', message: 'Adresse e-mail invalide' }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(400, body)));

    const error = await request('/auth/register', { method: 'POST', body: {} }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: 'Données invalides', details: body.details });
  });

  it('[ENF-UTI-03] falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502</html>', { status: 502 })));

    await expect(request('/health')).rejects.toMatchObject({
      status: 502,
      message: 'Une erreur inattendue est survenue.',
    });
  });
});
