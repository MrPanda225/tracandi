import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CollectedPage, RequestOptions } from '../http.js';
import { adapterFor, SOURCE_ADAPTERS } from './index.js';
import { genericAdapter } from './generic.js';
import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import { recruiteeAdapter } from './recruitee.js';
import { smartrecruitersAdapter } from './smartrecruiters.js';
import { personioAdapter } from './personio.js';
import { teamtailorAdapter } from './teamtailor.js';
import { workableAdapter } from './workable.js';
import { workdayAdapter } from './workday.js';
import { SourceFetchError, type AdapterDeps, type SourceAdapter } from './types.js';

/** A recorded answer of an ATS, anonymised (`tests/fixtures/ats/`): no request ever leaves the test. */
const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/ats/${name}.json`, import.meta.url)), 'utf8');

interface Call {
  url: string;
  options: RequestOptions | undefined;
}

/** A collector that answers the given bodies in order and records what was asked. */
const collector = (...answers: readonly (string | Partial<CollectedPage>)[]) => {
  const calls: Call[] = [];
  let next = 0;
  const deps: AdapterDeps = {
    // The generic page reads through a model; every other adapter ignores it (ENF-MAI-03).
    runTask: (<T>(_task: string, input: { schema: { parse: (value: unknown) => T } }) =>
      Promise.resolve({ data: input.schema.parse({ offers: [] }), provider: 'groq_1' as const })) as AdapterDeps['runTask'],
    fetch: (url, options) => {
      calls.push({ url, options });
      const answer = answers[Math.min(next, answers.length - 1)] ?? '';
      next += 1;
      const given = typeof answer === 'string' ? { body: answer } : answer;
      return Promise.resolve({ url, status: 200, contentType: 'application/json', body: '', ...given });
    },
  };
  return { deps, calls };
};

describe('SOURCE_ADAPTERS', () => {
  it('[ENF-MAI-03] answers for every source type of the data model, and for no other', () => {
    expect(SOURCE_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'greenhouse',
      'lever',
      'smartrecruiters',
      'recruitee',
      'workday',
      'talentsoft',
      'teamtailor',
      'personio',
      'workable',
      'ashby',
      'generic',
      'france_travail',
      'la_bonne_alternance',
    ]);
    expect(adapterFor('greenhouse')).toBe(greenhouseAdapter);
    expect(adapterFor('generic')).toBe(genericAdapter);
  });

  it.each(SOURCE_ADAPTERS)('[EF-VEI-01] $id names itself in French for the candidate', (adapter) => {
    expect(adapter.label).not.toBe('');
    expect(adapter.identifierHint).not.toBe('');
  });

  /** What the candidate types for each type of source (RG-08). */
const IDENTIFIERS: Readonly<Record<string, string>> = {
  workday: 'https://nova.wd3.myworkdayjobs.com/fr-FR/Carrieres',
  generic: 'https://novagroup.example/nous-rejoindre',
};
const identifierOf = (id: string): string => IDENTIFIERS[id] ?? 'novagroup';

const slugAdapters: readonly SourceAdapter[] = [
    greenhouseAdapter,
    leverAdapter,
    smartrecruitersAdapter,
    recruiteeAdapter,
    teamtailorAdapter,
    personioAdapter,
    workableAdapter,
  ];

  it.each(slugAdapters)('[EF-VEI-02] $id refuses an identifier outside RG-08', (adapter) => {
    expect(adapter.identifierSchema.safeParse('../../etc').success).toBe(false);
    expect(adapter.identifierSchema.safeParse('').success).toBe(false);
    expect(adapter.identifierSchema.safeParse('a/b').success).toBe(false);
    expect(adapter.identifierSchema.safeParse('a'.repeat(82)).success).toBe(false);
    // RG-08 is case-insensitive, and the same board must not be watched twice under two cases.
    expect(adapter.identifierSchema.parse('Atelier-Aurore.01')).toBe('atelier-aurore.01');
  });

  /**
   * The sources read on a company's site, through the responsible collector. An official source goes through its
   * own API client instead; its failures are tested with it (`franceTravail.test.ts`).
   */
  const companyAdapters = SOURCE_ADAPTERS.filter((adapter) => !adapter.isOfficial);

  it.each(companyAdapters)(
    '[ENF-FIA-02] $id turns a refusal of the source into a readable failure',
    async (adapter) => {
      const identifier = identifierOf(adapter.id);
      const { deps } = collector({ status: 503, body: 'Service Unavailable' });

      await expect(adapter.fetchOffers(identifier, deps)).rejects.toThrow(SourceFetchError);
      await expect(adapter.fetchOffers(identifier, deps)).rejects.toThrow('503');
    },
  );

  /**
   * The generic page reads HTML, not JSON: what an unusable answer means there is tested in `generic.test.ts`. The
   * feeds refuse it all the same: an HTML page is not their XML.
   */
  const jsonAdapters = companyAdapters.filter((adapter) => adapter.id !== 'generic');

  it.each(jsonAdapters)(
    '[ENF-FIA-02] $id refuses an answer that is not the expected JSON',
    async (adapter) => {
      const { deps } = collector('<html>maintenance</html>');

      await expect(adapter.fetchOffers(identifierOf(adapter.id), deps)).rejects.toThrow(SourceFetchError);
    },
  );
});

describe('greenhouseAdapter', () => {
  it('[EF-VEI-08] reads a Greenhouse board from its recorded answer', async () => {
    const { deps, calls } = collector(fixture('greenhouse'));

    const offers = await greenhouseAdapter.fetchOffers('atelieraurore', deps);

    expect(calls[0]?.url).toBe('https://boards-api.greenhouse.io/v1/boards/atelieraurore/jobs?content=true');
    expect(calls).toHaveLength(1);
    expect(offers[0]).toEqual({
      externalId: '4512890',
      title: 'Data Analyst',
      location: 'Paris, France',
      contractType: 'cdi',
      url: 'https://boards.greenhouse.io/atelieraurore/jobs/4512890',
      description: expect.stringContaining('Data Analyst'),
      postedAt: new Date('2026-09-18T08:12:44-04:00'),
    });
    // The description is read as text: no tag survives, and the escaped entities are resolved.
    expect(offers[0]?.description).toContain('SQL & Python');
    expect(offers[0]?.description).not.toContain('<');
    expect(offers[0]?.description).toContain('métiers');
  });

  it('[EF-VEI-22] falls back on the title when the board declares no contract, and drops an empty location', async () => {
    const { deps } = collector(fixture('greenhouse'));

    const offers = await greenhouseAdapter.fetchOffers('atelieraurore', deps);

    expect(offers[1]).toMatchObject({ contractType: 'alternance', location: null });
  });
});

describe('leverAdapter', () => {
  it('[EF-VEI-08] reads a Lever board from its recorded answer', async () => {
    const { deps, calls } = collector(fixture('lever'));

    const offers = await leverAdapter.fetchOffers('maisonlumen', deps);

    expect(calls[0]?.url).toBe('https://api.lever.co/v0/postings/maisonlumen?mode=json');
    expect(offers).toHaveLength(2);
    expect(offers[0]).toEqual({
      externalId: '6f1c3a2e-9d41-4f0b-9c2a-1b7e5d0a3c88',
      title: 'Développeur Data (H/F)',
      location: 'Lyon',
      contractType: 'alternance',
      url: 'https://jobs.lever.co/maisonlumen/6f1c3a2e-9d41-4f0b-9c2a-1b7e5d0a3c88',
      description: 'Rejoignez une équipe de six personnes sur la plateforme de données.',
      postedAt: new Date(1_757_923_200_000),
    });
  });

  it('[EF-VEI-22] leaves the contract unstated when neither the board nor the title names one', async () => {
    const { deps } = collector(fixture('lever'));

    const offers = await leverAdapter.fetchOffers('maisonlumen', deps);

    expect(offers[1]).toMatchObject({ contractType: 'non_precise', location: 'Télétravail' });
  });
});

describe('smartrecruitersAdapter', () => {
  it('[EF-VEI-08] reads a SmartRecruiters career site from its recorded answer', async () => {
    const { deps, calls } = collector(fixture('smartrecruiters'));

    const offers = await smartrecruitersAdapter.fetchOffers('novagroup', deps);

    expect(calls[0]?.url).toBe(
      'https://api.smartrecruiters.com/v1/companies/novagroup/postings?limit=100&offset=0',
    );
    // A page shorter than the limit is the last one: no second request to the same host (ENF-COL-02).
    expect(calls).toHaveLength(1);
    expect(offers[0]).toEqual({
      externalId: '744000012345678',
      title: 'Ingénieur Données',
      location: 'Nantes, Pays de la Loire',
      contractType: 'cdd',
      url: 'https://jobs.smartrecruiters.com/novagroup/744000012345678',
      description: null,
      postedAt: new Date('2026-09-15T09:00:00.000Z'),
    });
  });

  it('[EF-VEI-08] says « Télétravail » when the site gives no place but declares the offer remote', async () => {
    const { deps } = collector(fixture('smartrecruiters'));

    const offers = await smartrecruitersAdapter.fetchOffers('novagroup', deps);

    expect(offers[1]).toMatchObject({ location: 'Télétravail', contractType: 'non_precise' });
  });

  it('[EF-VEI-08] asks for the next page as long as the site fills the one it answered', async () => {
    const full = JSON.stringify({
      content: Array.from({ length: 100 }, (_item, index) => ({
        id: `7440000123456${String(index).padStart(2, '0')}`,
        name: 'Data Analyst',
        location: { city: 'Nantes' },
      })),
    });
    const { deps, calls } = collector(full, JSON.stringify({ content: [] }));

    const offers = await smartrecruitersAdapter.fetchOffers('novagroup', deps);

    expect(offers).toHaveLength(100);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toContain('offset=100');
  });
});

describe('recruiteeAdapter', () => {
  it('[EF-VEI-08] reads a Recruitee career site from its recorded answer', async () => {
    const { deps, calls } = collector(fixture('recruitee'));

    const offers = await recruiteeAdapter.fetchOffers('cielbleu', deps);

    expect(calls[0]?.url).toBe('https://cielbleu.recruitee.com/api/offers/');
    expect(offers[0]).toEqual({
      externalId: '1234567',
      title: 'Data Engineer',
      location: 'Bordeaux',
      contractType: 'autre',
      url: 'https://cielbleu.recruitee.com/o/data-engineer',
      description: 'Vous construisez les pipelines de la plateforme.\n\nPython\nSQL',
      postedAt: new Date('2026-09-10T07:30:00.000+02:00'),
    });
    expect(offers[1]).toMatchObject({ contractType: 'cdi', location: 'France' });
  });

  it('[EF-VEI-08] keeps only the published offers, never a closed or a draft one', async () => {
    const board = JSON.stringify({
      offers: [
        {
          id: 1,
          slug: 'closed',
          title: 'Poste fermé',
          careers_url: 'https://cielbleu.recruitee.com/o/closed',
          status: 'closed',
        },
      ],
    });
    const { deps } = collector(board);

    await expect(recruiteeAdapter.fetchOffers('cielbleu', deps)).resolves.toEqual([]);
  });
});

describe('workdayAdapter', () => {
  const SITE = 'https://nova.wd3.myworkdayjobs.com/fr-FR/Carrieres';

  it('[EF-VEI-02] accepts the address of a career site and refuses anything else (RG-08)', () => {
    expect(workdayAdapter.identifierSchema.parse(SITE)).toBe(SITE);
    expect(workdayAdapter.identifierSchema.safeParse('https://nova.example.com/Carrieres').success).toBe(
      false,
    );
    expect(
      workdayAdapter.identifierSchema.safeParse('http://nova.wd3.myworkdayjobs.com/Carrieres').success,
    ).toBe(false);
    expect(workdayAdapter.identifierSchema.safeParse('https://nova.wd3.myworkdayjobs.com').success).toBe(
      false,
    );
  });

  it('[EF-VEI-08] reads a Workday career site from its recorded answer', async () => {
    const { deps, calls } = collector(fixture('workday'));

    const offers = await workdayAdapter.fetchOffers(SITE, deps);

    // The listing only answers POST: the search is sent as a body, through the same responsible client.
    expect(calls[0]?.url).toBe('https://nova.wd3.myworkdayjobs.com/wday/cxs/nova/Carrieres/jobs');
    expect(calls[0]?.options).toEqual({
      method: 'POST',
      json: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' },
    });
    expect(offers[0]).toEqual({
      externalId: 'JR-10023',
      title: 'Analyste Données',
      location: 'Paris, France',
      contractType: 'non_precise',
      url: 'https://nova.wd3.myworkdayjobs.com/job/Paris/Analyste-Donnees_JR-10023',
      description: null,
      postedAt: null,
    });
    expect(offers[1]).toMatchObject({ externalId: 'JR-10099', contractType: 'alternance' });
  });

  it('[EF-VEI-08] finds the site even when its address carries no locale', async () => {
    const { deps, calls } = collector(fixture('workday'));

    await workdayAdapter.fetchOffers('https://nova.wd3.myworkdayjobs.com/Carrieres', deps);

    expect(calls[0]?.url).toBe('https://nova.wd3.myworkdayjobs.com/wday/cxs/nova/Carrieres/jobs');
  });
});
