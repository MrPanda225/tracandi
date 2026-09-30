import { z } from 'zod';
import { SourceFetchError } from '../adapters/types.js';
import type { OfficialApi, OfficialRequest } from './client.js';

/** API Apprentissage, route of the job offers: 60 calls per minute published, half kept (ENF-COL-05). */
export const LA_BONNE_ALTERNANCE_API: OfficialApi = { name: 'La bonne alternance', requestsPerSecond: 0.5 };

const SEARCH_URL = 'https://api.apprentissage.beta.gouv.fr/api/job/v1/search';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const LABEL = 'La bonne alternance';

const SearchSchema = z.object({ jobs: z.array(z.unknown()).default([]) });
const RefusalSchema = z.object({ message: z.string() });

/** The search of the work-study offers of La bonne alternance. */
export interface LaBonneAlternanceApi {
  /**
   * The offers matching these parameters (450 at most, the API does not page).
   * @returns the raw offers, unknown until the adapter reads them (clean-code.md).
   * @throws SourceFetchError on a refusal of the API, with a message the candidate can read (EF-VEI-11).
   */
  search: (params: Readonly<Record<string, string>>) => Promise<unknown[]>;
}

const jsonOf = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch (failure) {
    throw new SourceFetchError(`${LABEL} n’a pas renvoyé de JSON.`, { cause: failure });
  }
};

/**
 * ENF-SEC-23: the client of La bonne alternance. The key comes from the configuration and is never logged nor
 * returned.
 * @req EF-VEI-34, ENF-SEC-23, ENF-COL-05
 */
export const createLaBonneAlternanceApi = ({
  request,
  apiKey,
}: {
  request: OfficialRequest;
  apiKey: string;
}): LaBonneAlternanceApi => ({
  async search(params) {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams(params).toString();
    const response = await request(LA_BONNE_ALTERNANCE_API, url.href, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.status === HTTP_OK) {
      const read = SearchSchema.safeParse(jsonOf(response.body));
      if (!read.success) throw new SourceFetchError(`${LABEL} a renvoyé une réponse inattendue.`);
      return read.data.jobs;
    }
    if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
      throw new SourceFetchError(`${LABEL} a refusé la clé d’accès (LBA_API_KEY).`);
    }
    if (response.status === HTTP_BAD_REQUEST) {
      const refusal = RefusalSchema.safeParse(jsonOf(response.body));
      throw new SourceFetchError(
        `${LABEL} a refusé la recherche${refusal.success ? ` : ${refusal.data.message}` : '.'}`,
      );
    }
    throw new SourceFetchError(`${LABEL} a répondu ${String(response.status)}.`);
  },
});
