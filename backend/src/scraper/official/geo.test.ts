import { describe, expect, it, vi } from 'vitest';
import type { OfficialRequest } from './client.js';
import { createPlaceFinder, PlaceLookupError } from './geo.js';

/** The public service, simulated with the shape geo.api.gouv.fr answers (fictitious values). */
const NANTERRE = {
  nom: 'Nanterre',
  code: '92050',
  codeDepartement: '92',
  centre: { type: 'Point', coordinates: [2.2071, 48.8924] },
};

const service = (status: number, body: unknown) => {
  const request = vi.fn<OfficialRequest>(() =>
    Promise.resolve({
      status,
      headers: new Headers(),
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  return request;
};

describe('communes (EF-VEI-30)', () => {
  it('[EF-VEI-30] [ENF-RGP-11] sends only the text typed, and reads the commune', async () => {
    const request = service(200, [NANTERRE]);

    const places = await createPlaceFinder(request)('  Nanterre ');

    expect(places).toEqual([
      { code: '92050', name: 'Nanterre', departmentCode: '92', latitude: 48.8924, longitude: 2.2071 },
    ]);
    const url = new URL(String(request.mock.calls[0]?.[1]));
    expect(url.origin + url.pathname).toBe('https://geo.api.gouv.fr/communes');
    expect(url.searchParams.get('nom')).toBe('Nanterre');
    expect([...url.searchParams.keys()].sort()).toEqual(['boost', 'fields', 'limit', 'nom']);
  });

  it('[EF-VEI-30] asks nothing for less than two characters', async () => {
    const request = service(200, []);

    expect(await createPlaceFinder(request)('N')).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['an error status', service(503, '')],
    ['a body that is not JSON', service(200, '<html>')],
    ['an unexpected format', service(200, [{ nom: 'Nanterre' }])],
  ])('[EF-VEI-30] fails readably on %s', async (_case, request) => {
    await expect(createPlaceFinder(request)('Nanterre')).rejects.toBeInstanceOf(PlaceLookupError);
  });
});
