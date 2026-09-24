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

/** Un collecteur qui répond une page par adresse, et retient l'ordre dans lequel elles ont été demandées. */
const site = (pages: Record<string, string>, answers: readonly unknown[]) => {
  const visited: string[] = [];
  let next = 0;
  const runTask = vi.fn((_task: string, input: { schema: { parse: (value: unknown) => unknown } }) => {
    const answer = answers[Math.min(next, answers.length - 1)];
    next += 1;
    return Promise.resolve({ data: input.schema.parse(answer), provider: 'groq_1' as const });
  }) as unknown as RunAdapterTask;
  const deps: AdapterDeps & { runTask: RunAdapterTask } = {
    fetch: (url) => {
      visited.push(url);
      const body = pages[url];
      return Promise.resolve({
        url,
        status: body === undefined ? 404 : 200,
        contentType: 'text/html',
        body: body ?? '',
      });
    },
    runTask,
  };
  return { deps, visited, aiCalls: () => next };
};

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

  it('[EF-VEI-27] bounces from the home page to the career page, without asking the AI', async () => {
    const home = '<a href="/nos-offres">Nos offres</a><a href="/contact">Contact</a>';
    const board = '<a href="/offres/data-analyst">Data Analyst</a>';
    const {
      deps: dependencies,
      visited,
      aiCalls,
    } = site({ 'https://atelier-aurore.fr/': home, 'https://atelier-aurore.fr/nos-offres': board }, [
      { offers: [{ title: 'Data Analyst', url: 'https://atelier-aurore.fr/offres/data-analyst' }] },
    ]);

    const offers = await genericAdapter.fetchOffers('https://atelier-aurore.fr/', dependencies);

    // La page d'accueil n'a coûté aucun appel d'IA : le lien du site suffisait.
    expect(visited).toEqual(['https://atelier-aurore.fr/', 'https://atelier-aurore.fr/nos-offres']);
    expect(aiCalls()).toBe(1);
    expect(offers[0]).toMatchObject({ title: 'Data Analyst' });
  });

  it('[EF-VEI-27] follows the address the model spotted when the site names no link', async () => {
    const home = '<a href="/rejoindre-la-maison">Notre maison</a>';
    const board = '<a href="/rejoindre-la-maison/data">Data Analyst</a>';
    const { deps: dependencies, visited } = site(
      {
        'https://atelier-aurore.fr/': home,
        'https://atelier-aurore.fr/rejoindre-la-maison': board,
      },
      [
        { offers: [], careerPageUrl: 'https://atelier-aurore.fr/rejoindre-la-maison' },
        { offers: [{ title: 'Data Analyst' }] },
      ],
    );

    const offers = await genericAdapter.fetchOffers('https://atelier-aurore.fr/', dependencies);

    expect(visited).toEqual(['https://atelier-aurore.fr/', 'https://atelier-aurore.fr/rejoindre-la-maison']);
    expect(offers).toHaveLength(1);
  });

  it('[ENF-SEC-06] never follows an address the model invented, nor one off the site', async () => {
    const home = '<a href="/a-propos">À propos</a>';
    const { deps: dependencies, visited } = site({ 'https://atelier-aurore.fr/': home }, [
      { offers: [], careerPageUrl: 'https://www.indeed.fr/cmp/atelier-aurore' },
    ]);

    await expect(genericAdapter.fetchOffers('https://atelier-aurore.fr/', dependencies)).resolves.toEqual([]);
    expect(visited).toEqual(['https://atelier-aurore.fr/']);
  });

  it('[EF-VEI-27] bounces once and no further: a career page without offers is not crawled', async () => {
    const home = '<a href="/carrieres">Carrières</a>';
    const board = '<a href="/carrieres/postes">Nos offres</a>';
    const { deps: dependencies, visited } = site(
      { 'https://atelier-aurore.fr/': home, 'https://atelier-aurore.fr/carrieres': board },
      [{ offers: [], careerPageUrl: 'https://atelier-aurore.fr/carrieres/postes' }],
    );

    await expect(genericAdapter.fetchOffers('https://atelier-aurore.fr/', dependencies)).resolves.toEqual([]);
    expect(visited).toHaveLength(2);
  });

  it('[EF-IA-04] says so when no AI service is available, instead of answering nothing', async () => {
    const withoutAi: AdapterDeps = { fetch: deps(EXTRACTED).fetch };

    await expect(genericAdapter.fetchOffers(ADDRESS, withoutAi)).rejects.toThrow('service d’IA');
  });
});
