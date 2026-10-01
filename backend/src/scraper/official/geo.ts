import { z } from 'zod';
import type { OfficialApi, OfficialRequest } from './client.js';

/** API Découpage administratif (geo.api.gouv.fr): 50 requests per second published, 5 kept (ENF-COL-05). */
export const GEO_API: OfficialApi = { name: 'Découpage administratif', requestsPerSecond: 5 };

const COMMUNES_URL = 'https://geo.api.gouv.fr/communes';
const MAX_PLACES = 5;
const HTTP_OK = 200;
const MIN_QUERY_LENGTH = 2;

/** A French commune, as the search criteria keep it (EF-VEI-30). */
export interface Place {
  /** INSEE code: « 92050 », « 2A004 ». */
  code: string;
  name: string;
  departmentCode: string;
  latitude: number;
  longitude: number;
}

const CommuneSchema = z.object({
  nom: z.string(),
  code: z.string(),
  codeDepartement: z.string(),
  centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
});

/** The service answered something unusable; the message is shown to the candidate. */
export class PlaceLookupError extends Error {
  constructor(
    message = 'Le service des communes ne répond pas. Réessayez dans quelques instants.',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PlaceLookupError';
  }
}

export type PlaceFinder = (query: string) => Promise<Place[]>;

/**
 * EF-VEI-30: the communes whose name starts like the text typed, most populated first. Only that text leaves the
 * server (ENF-RGP-11); a query shorter than two characters asks nothing.
 * @throws PlaceLookupError when the service fails or answers outside its format.
 * @req EF-VEI-30, ENF-RGP-11, ENF-COL-05
 */
export const createPlaceFinder =
  (request: OfficialRequest): PlaceFinder =>
  async (query) => {
    const text = query.trim();
    if (text.length < MIN_QUERY_LENGTH) return [];
    const url = new URL(COMMUNES_URL);
    url.search = new URLSearchParams({
      nom: text,
      fields: 'nom,code,codeDepartement,centre',
      boost: 'population',
      limit: String(MAX_PLACES),
    }).toString();
    const response = await request(GEO_API, url.href).catch((failure: unknown) => {
      throw new PlaceLookupError(undefined, { cause: failure });
    });
    if (response.status !== HTTP_OK) throw new PlaceLookupError();
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new PlaceLookupError();
    }
    const read = z.array(CommuneSchema).safeParse(parsed);
    if (!read.success) throw new PlaceLookupError();
    return read.data.slice(0, MAX_PLACES).map((commune) => ({
      code: commune.code,
      name: commune.nom,
      departmentCode: commune.codeDepartement,
      longitude: commune.centre.coordinates[0],
      latitude: commune.centre.coordinates[1],
    }));
  };
