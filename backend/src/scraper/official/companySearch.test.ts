import { describe, expect, it, vi } from 'vitest';
import type { OfficialRequest } from './client.js';
import { createSirenFinder } from './companySearch.js';

/** The API, simulated with the shape it answers (fictitious companies). */
const answering = (status: number, results: unknown[]) =>
  vi.fn<OfficialRequest>(() =>
    Promise.resolve({
      status,
      headers: new Headers(),
      body: JSON.stringify({ results, total_results: results.length }),
    }),
  );

const company = (siren: string, name: string, state = 'A') => ({
  siren,
  nom_complet: name,
  nom_raison_sociale: name,
  etat_administratif: state,
  siege: { siret: `${siren}00012` },
});

describe('SIREN of a company (EF-VEI-36)', () => {
  it('[EF-VEI-36] [ENF-RGP-11] keeps the SIREN of the single active company of that key, without its directors', async () => {
    const request = answering(200, [
      company('123456789', 'EXEMPLE CONSEIL SE'),
      company('987654321', 'EXEMPLE CONSEIL DIGITAL'),
    ]);

    expect(await createSirenFinder(request)('Exemple Conseil')).toBe('123456789');
    const url = new URL(String(request.mock.calls[0]?.[1]));
    expect(url.searchParams.get('q')).toBe('Exemple Conseil');
    expect(url.searchParams.get('minimal')).toBe('true');
    expect(url.searchParams.get('include')).toBe('siege');
  });

  it('[EF-VEI-36] gives nothing for two namesakes rather than a guess', async () => {
    const request = answering(200, [company('123456789', 'EXEMPLE'), company('987654321', 'EXEMPLE SAS')]);

    expect(await createSirenFinder(request)('Exemple')).toBeNull();
  });

  it('[EF-VEI-36] never keeps a closed company', async () => {
    expect(
      await createSirenFinder(answering(200, [company('123456789', 'EXEMPLE', 'C')]))('Exemple'),
    ).toBeNull();
  });

  it('[EF-VEI-36] gives nothing when the API fails or answers something else', async () => {
    expect(await createSirenFinder(answering(429, []))('Exemple')).toBeNull();
    const garbled = vi.fn<OfficialRequest>(() =>
      Promise.resolve({ status: 200, headers: new Headers(), body: '<html>' }),
    );
    expect(await createSirenFinder(garbled)('Exemple')).toBeNull();
  });

  it('[EF-VEI-36] asks nothing for a name without letters', async () => {
    const request = answering(200, []);

    expect(await createSirenFinder(request)(' - ')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
