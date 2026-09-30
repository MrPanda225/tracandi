import { describe, expect, it, vi } from 'vitest';
import type { OfficialRequest, OfficialResponse } from './client.js';
import { createLaBonneAlternanceApi } from './laBonneAlternance.js';

const answer = (status: number, body: unknown = ''): OfficialResponse => ({
  status,
  headers: new Headers(),
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('La bonne alternance API (EF-VEI-34, ENF-SEC-23)', () => {
  it('[ENF-SEC-23] sends the key in a header, never in the address', async () => {
    const request = vi.fn<OfficialRequest>(() =>
      Promise.resolve(answer(200, { jobs: [{ a: 1 }], recruiters: [] })),
    );

    const jobs = await createLaBonneAlternanceApi({ request, apiKey: 'cle-fictive' }).search({
      romes: 'M1419',
    });

    expect(jobs).toEqual([{ a: 1 }]);
    const [, url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.apprentissage.beta.gouv.fr/api/job/v1/search?romes=M1419');
    expect(url).not.toContain('cle-fictive');
    expect(init?.headers).toEqual({ Authorization: 'Bearer cle-fictive' });
  });

  it.each([
    [answer(401), /clé/u],
    [answer(403), /clé/u],
    [answer(400, { message: 'romes invalide' }), /romes invalide/u],
    [answer(502), /502/u],
    [answer(200, '<html>'), /JSON/u],
  ])('[EF-VEI-11] fails readably on %#', async (response, message) => {
    const api = createLaBonneAlternanceApi({ request: () => Promise.resolve(response), apiKey: 'cle' });

    await expect(api.search({})).rejects.toThrow(message);
  });
});
