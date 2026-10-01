import { describe, expect, it, vi } from 'vitest';
import { SourceFetchError } from '../adapters/types.js';
import type { OfficialRequest, OfficialResponse } from './client.js';
import { createFranceTravailApi } from './franceTravail.js';

const CREDENTIALS = { clientId: 'client-fictif', clientSecret: 'secret-fictif' };

const answer = (status: number, body: unknown = ''): OfficialResponse => ({
  status,
  headers: new Headers(),
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const TOKEN = answer(200, { access_token: 'jeton-1', expires_in: 1499, token_type: 'Bearer' });

/** The API, simulated: a token request, then the searches, each answered in turn. */
const service = (...searches: OfficialResponse[]) => {
  let next = 0;
  const request = vi.fn<OfficialRequest>((_api, url) => {
    if (url.startsWith('https://entreprise.francetravail.fr/')) return Promise.resolve(TOKEN);
    const response = searches[Math.min(next, searches.length - 1)] ?? answer(500);
    next += 1;
    return Promise.resolve(response);
  });
  return request;
};

describe('France Travail API (EF-VEI-32, ENF-SEC-23)', () => {
  it('[ENF-SEC-23] asks a token with the credentials in the body, never in an address', async () => {
    const request = service(answer(200, { resultats: [{ id: '1' }] }));

    await createFranceTravailApi({ request, credentials: CREDENTIALS }).search({ motsCles: 'data' });

    const [tokenCall, searchCall] = request.mock.calls;
    expect(tokenCall?.[2]?.form).toEqual({
      grant_type: 'client_credentials',
      client_id: 'client-fictif',
      client_secret: 'secret-fictif',
      scope: 'api_offresdemploiv2 o2dsoffre',
    });
    expect(request.mock.calls.some((call) => call[1].includes('secret-fictif'))).toBe(false);
    expect(searchCall?.[1]).toBe(
      'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?motsCles=data',
    );
    expect(searchCall?.[2]?.headers).toEqual({ Authorization: 'Bearer jeton-1' });
  });

  it('[ENF-SEC-23] keeps the token in memory until shortly before it expires', async () => {
    const request = service(answer(200, { resultats: [] }));
    let now = 0;
    const api = createFranceTravailApi({ request, credentials: CREDENTIALS, now: () => now });

    await api.search({});
    await api.search({});
    now = 1_450_000;
    await api.search({});

    const tokenCalls = request.mock.calls.filter((call) => call[1].startsWith('https://entreprise.'));
    expect(tokenCalls).toHaveLength(2);
  });

  it('[EF-VEI-32] asks a new token once when the API refuses the current one', async () => {
    const request = service(answer(401), answer(200, { resultats: [{ id: '1' }] }));

    const results = await createFranceTravailApi({ request, credentials: CREDENTIALS }).search({});

    expect(results).toEqual([{ id: '1' }]);
  });

  it('[EF-VEI-32] reads partial content (206) and no content (204)', async () => {
    const api = createFranceTravailApi({
      request: service(answer(206, { resultats: [{ id: '1' }, { id: '2' }] }), answer(204)),
      credentials: CREDENTIALS,
    });

    expect(await api.search({})).toHaveLength(2);
    expect(await api.search({})).toEqual([]);
  });

  it.each([
    [answer(400, { message: 'Valeur du paramètre « commune » incorrecte.' }), /commune/u],
    [answer(503), /503/u],
    [answer(200, '<html>'), /JSON/u],
  ])('[EF-VEI-11] fails readably on %#', async (response, message) => {
    const api = createFranceTravailApi({ request: service(response), credentials: CREDENTIALS });

    await expect(api.search({})).rejects.toThrow(message);
    await expect(api.search({})).rejects.toBeInstanceOf(SourceFetchError);
  });

  it('[EF-VEI-37] says the application credentials were refused', async () => {
    const request = vi.fn<OfficialRequest>(() => Promise.resolve(answer(401, { error: 'invalid_client' })));

    await expect(createFranceTravailApi({ request, credentials: CREDENTIALS }).search({})).rejects.toThrow(
      /refusé les identifiants/u,
    );
  });
});
