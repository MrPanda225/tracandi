import { z } from 'zod';
import type { OfficialCredentials } from '../../config/env.js';
import { SourceFetchError } from '../adapters/types.js';
import type { OfficialApi, OfficialRequest } from './client.js';

/** API « Offres d'emploi v2 »: 10 calls per second published, 5 kept (ENF-COL-05). */
export const FRANCE_TRAVAIL_API: OfficialApi = { name: 'France Travail', requestsPerSecond: 5 };

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';
const SCOPE = 'api_offresdemploiv2 o2dsoffre';
const MS_PER_SECOND = 1000;
/** A token is renewed this long before it expires, so that no search is sent with one about to lapse. */
const TOKEN_MARGIN_MS = 60_000;
const HTTP_OK = 200;
const HTTP_PARTIAL = 206;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;

const LABEL = 'France Travail';

const TokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.coerce.number().positive() });
const SearchSchema = z.object({ resultats: z.array(z.unknown()).default([]) });
const RefusalSchema = z.object({ message: z.string() });

/** The search of the offers of France Travail, its token handled out of sight. */
export interface FranceTravailApi {
  /**
   * One page of offers matching these parameters (at most 150, `range` given by the caller).
   * @returns the raw results, unknown until an adapter reads them (clean-code.md); none on a 204.
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
 * ENF-SEC-23: the client of the France Travail application. The credentials come from the configuration and the
 * token lives in memory only; neither is ever logged nor returned. A token refused once (401) is asked again once.
 * @req EF-VEI-32, ENF-SEC-23, ENF-COL-05
 */
export const createFranceTravailApi = ({
  request,
  credentials,
  now = Date.now,
}: {
  request: OfficialRequest;
  credentials: OfficialCredentials;
  now?: () => number;
}): FranceTravailApi => {
  let token: { value: string; expiresAt: number } | null = null;

  const freshToken = async (): Promise<string> => {
    if (token && token.expiresAt - TOKEN_MARGIN_MS > now()) return token.value;
    const response = await request(FRANCE_TRAVAIL_API, TOKEN_URL, {
      form: {
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: SCOPE,
      },
    });
    const read = TokenSchema.safeParse(response.status === HTTP_OK ? jsonOf(response.body) : null);
    if (!read.success) {
      throw new SourceFetchError(
        `${LABEL} a refusé les identifiants de l’application (${String(response.status)}).`,
      );
    }
    token = { value: read.data.access_token, expiresAt: now() + read.data.expires_in * MS_PER_SECOND };
    return token.value;
  };

  const searchOnce = async (params: Readonly<Record<string, string>>) => {
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams(params).toString();
    return request(FRANCE_TRAVAIL_API, url.href, {
      headers: { Authorization: `Bearer ${await freshToken()}` },
    });
  };

  return {
    async search(params) {
      let response = await searchOnce(params);
      if (response.status === HTTP_UNAUTHORIZED) {
        token = null;
        response = await searchOnce(params);
      }
      if (response.status === HTTP_NO_CONTENT) return [];
      if (response.status === HTTP_OK || response.status === HTTP_PARTIAL) {
        const read = SearchSchema.safeParse(jsonOf(response.body));
        if (!read.success) throw new SourceFetchError(`${LABEL} a renvoyé une réponse inattendue.`);
        return read.data.resultats;
      }
      if (response.status === HTTP_BAD_REQUEST) {
        const refusal = RefusalSchema.safeParse(jsonOf(response.body));
        throw new SourceFetchError(
          `${LABEL} a refusé la recherche${refusal.success ? ` : ${refusal.data.message}` : '.'}`,
        );
      }
      throw new SourceFetchError(`${LABEL} a répondu ${String(response.status)}.`);
    },
  };
};
