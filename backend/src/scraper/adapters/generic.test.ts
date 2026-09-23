import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ExtractedOffersSchema } from '../../modules/offers/extraction.js';
import type { CollectedPage } from '../http.js';
import { genericAdapter } from './generic.js';
import { SourceFetchError, type AdapterDeps, type RunAdapterTask } from './types.js';

const fixture = (name: string, extension: string): string =>
  readFileSync(
    fileURLToPath(new URL(`../../../tests/fixtures/${name}.${extension}`, import.meta.url)),
    'utf8',
  );

const PAGE = fixture('ats/generic-career-page', 'html');
const EXTRACTED = JSON.parse(fixture('llm/extract_offers', 'json')) as unknown;
const ADDRESS = 'https://atelier-aurore.fr/nous-rejoindre';

/** A collector and an AI router, both simulated: no request and no model call ever leaves a test (testing.md). */
const deps = (
  answer: unknown,
  page: Partial<CollectedPage> = {},
): AdapterDeps & { runTask: RunAdapterTask } => {
  const runTask = vi.fn((_task: string, input: { schema: { parse: (value: unknown) => unknown } }) =>
    Promise.resolve({ data: input.schema.parse(answer), provider: 'groq_1' as const }),
  ) as unknown as RunAdapterTask;
  return {
    fetch: () =>
      Promise.resolve({
        url: ADDRESS,
        status: 200,
        contentType: 'text/html',
        body: PAGE,
        ...page,
      }),
    runTask,
  };
};

describe('genericAdapter', () => {
  it('[EF-VEI-02] accepts the https address of a career page and refuses anything else (RG-08)', () => {
    expect(genericAdapter.identifierSchema.parse(ADDRESS)).toBe(ADDRESS);
    expect(genericAdapter.identifierSchema.safeParse('http://atelier-aurore.fr/carrieres').success).toBe(
      false,
    );
    expect(genericAdapter.identifierSchema.safeParse('atelier-aurore.fr').success).toBe(false);
  });

  it('[EF-VEI-08] reads a career page through the AI and normalises what it answered', async () => {
    const offers = await genericAdapter.fetchOffers(ADDRESS, deps(EXTRACTED));

    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      title: 'Data Analyst',
      location: 'Paris',
      contractType: 'cdi',
      url: 'https://atelier-aurore.fr/offres/data-analyst',
      description: 'Construction et maintien des tableaux de bord de la direction.',
      postedAt: null,
    });
    // A board on a subdomain of the source is the same site: the candidate is sent there.
    expect(offers[1]).toMatchObject({
      contractType: 'alternance',
      url: 'https://jobs.atelier-aurore.fr/alternance-data-engineer',
    });
  });

  it('[EF-VEI-08] [ENF-SEC-06] drops an address outside the site, and points the offer at the page', async () => {
    const elsewhere = {
      offers: [{ title: 'Data Analyst', url: 'https://www.indeed.fr/viewjob?jk=abc', location: 'Paris' }],
    };

    const offers = await genericAdapter.fetchOffers(ADDRESS, deps(elsewhere));

    expect(offers[0]?.url).toBe(ADDRESS);
    expect(offers[0]?.title).toBe('Data Analyst');
  });

  it('[ENF-SEC-06] drops an address the page never carried, even on the right domain', async () => {
    const invented = {
      offers: [{ title: 'Data Analyst', url: 'https://atelier-aurore.fr/offres/poste-invente' }],
    };

    const offers = await genericAdapter.fetchOffers(ADDRESS, deps(invented));

    expect(offers[0]?.url).toBe(ADDRESS);
  });

  it('[EF-VEI-09] gives an offer without a link an identifier stable from one check to the next', async () => {
    const withoutLink = { offers: [{ title: 'Data Analyst' }] };

    const first = await genericAdapter.fetchOffers(ADDRESS, deps(withoutLink));
    const second = await genericAdapter.fetchOffers(ADDRESS, deps(withoutLink));

    expect(first[0]?.externalId).toBe(second[0]?.externalId);
    // Two offers of the same page never share an identifier.
    const two = await genericAdapter.fetchOffers(
      ADDRESS,
      deps({ offers: [{ title: 'Data Analyst' }, { title: 'Data Engineer' }] }),
    );
    expect(two[0]?.externalId).not.toBe(two[1]?.externalId);
  });

  it('[EF-VEI-08] gives the model the text and the links of the page, and its own schema', async () => {
    const dependencies = deps(EXTRACTED);

    await genericAdapter.fetchOffers(ADDRESS, dependencies);

    expect(dependencies.runTask).toHaveBeenCalledWith(
      'extract_offers',
      expect.objectContaining({
        schema: ExtractedOffersSchema,
        prompt: expect.stringContaining('Data Analyst → https://atelier-aurore.fr/offres/data-analyst'),
      }),
    );
  });

  it('[EF-VEI-08] answers no offer when the page publishes none', async () => {
    await expect(genericAdapter.fetchOffers(ADDRESS, deps({ offers: [] }))).resolves.toEqual([]);
  });

  it('[ENF-FIA-02] turns a refusal of the page into a readable failure', async () => {
    await expect(genericAdapter.fetchOffers(ADDRESS, deps(EXTRACTED, { status: 404 }))).rejects.toThrow(
      SourceFetchError,
    );
  });

  it('[EF-IA-04] says so when no AI service is available, instead of answering nothing', async () => {
    const withoutAi: AdapterDeps = { fetch: deps(EXTRACTED).fetch };

    await expect(genericAdapter.fetchOffers(ADDRESS, withoutAi)).rejects.toThrow('service d’IA');
  });
});
