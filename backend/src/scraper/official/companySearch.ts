import { z } from 'zod';
import { companyKey } from '../../lib/text.js';
import type { OfficialApi, OfficialRequest } from './client.js';

/** API Recherche d'entreprises (DINUM): 7 requests per second per address published, 3 kept (ENF-COL-05). */
export const COMPANY_SEARCH_API: OfficialApi = { name: 'Recherche d’entreprises', requestsPerSecond: 3 };

const SEARCH_URL = 'https://recherche-entreprises.api.gouv.fr/search';
const HTTP_OK = 200;
const CANDIDATES = 10;

const ResultSchema = z.object({
  siren: z.string().regex(/^\d{9}$/u),
  nom_complet: z.string().nullish(),
  nom_raison_sociale: z.string().nullish(),
  sigle: z.string().nullish(),
  etat_administratif: z.string().nullish(),
});
const AnswerSchema = z.object({ results: z.array(z.unknown()).default([]) });

/** The SIREN of a company by its name, or null when the answer is not certain. */
export type SirenFinder = (name: string) => Promise<string | null>;

const namesOf = (result: z.infer<typeof ResultSchema>): string[] =>
  [result.nom_raison_sociale, result.nom_complet, result.sigle].filter((name): name is string =>
    Boolean(name),
  );

/**
 * EF-VEI-36: the SIREN of a company, kept only when exactly one active company carries the same RG-26 key under one
 * of its names; two namesakes give nothing rather than a guess. Only the name leaves the server (ENF-RGP-11), and
 * the directors are never asked for (`minimal=true`, `include=siege`).
 * @throws the failure of the request; the caller decides whether it matters.
 * @req EF-VEI-36, ENF-RGP-11, ENF-COL-05
 */
export const createSirenFinder =
  (request: OfficialRequest): SirenFinder =>
  async (name) => {
    const key = companyKey(name);
    if (key === '') return null;
    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({
      q: name,
      minimal: 'true',
      include: 'siege',
      etat_administratif: 'A',
      per_page: String(CANDIDATES),
    }).toString();
    const response = await request(COMPANY_SEARCH_API, url.href);
    if (response.status !== HTTP_OK) return null;
    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      return null;
    }
    const answer = AnswerSchema.safeParse(body);
    if (!answer.success) return null;
    const matching = new Set(
      answer.data.results.flatMap((raw) => {
        const read = ResultSchema.safeParse(raw);
        if (!read.success || (read.data.etat_administratif ?? 'A') !== 'A') return [];
        return namesOf(read.data).some((known) => companyKey(known) === key) ? [read.data.siren] : [];
      }),
    );
    return matching.size === 1 ? ([...matching][0] ?? null) : null;
  };
