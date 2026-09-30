import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CollectedPage } from '../http.js';
import { ashbyAdapter } from './ashby.js';
import { personioAdapter } from './personio.js';
import { talentsoftAdapter } from './talentsoft.js';
import { teamtailorAdapter } from './teamtailor.js';
import type { AdapterDeps } from './types.js';
import { workableAdapter } from './workable.js';

/** A recorded answer, fictitious but in the real format of each feed (`tests/fixtures/ats/`). */
const fixture = (name: string): string =>
  readFileSync(new URL(`../../../tests/fixtures/ats/${name}`, import.meta.url), 'utf8');

/** A collector answering one body and recording the address asked: no request ever leaves the test. */
const answering = (body: string, extra: Partial<CollectedPage> = {}) => {
  const urls: string[] = [];
  const deps: AdapterDeps = {
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve({ url, status: 200, contentType: 'application/xml', body, ...extra });
    },
  };
  return { deps, urls };
};

describe('teamtailorAdapter (EF-VEI-08, v1.33)', () => {
  it('[EF-VEI-08] reads the RSS feed of a Teamtailor career site', async () => {
    const { deps, urls } = answering(fixture('teamtailor.rss'));

    const offers = await teamtailorAdapter.fetchOffers('exemplia', deps);

    expect(urls).toEqual(['https://exemplia.teamtailor.com/jobs.rss?per_page=100']);
    expect(offers[0]).toEqual({
      externalId: '00000000-1111-2222-3333-444444444444',
      title: 'Chargé de données H/F',
      location: 'Lyon',
      contractType: 'non_precise',
      url: 'https://exemplia.teamtailor.com/jobs/1234567-charge-de-donnees',
      description: "Rejoignez l'équipe data : SQL et tableaux de bord.",
      postedAt: new Date('2026-07-24T07:05:16.000Z'),
    });
    // The title names the contract, and a fully remote offer says so where the place would be.
    expect(offers[1]).toMatchObject({ contractType: 'alternance', location: 'Télétravail' });
  });
});

describe('talentsoftAdapter (EF-VEI-08, v1.33)', () => {
  it('[EF-VEI-08] reads the RSS feed of a Cegid Talentsoft career site', async () => {
    const { deps, urls } = answering(fixture('talentsoft.rss'));

    const offers = await talentsoftAdapter.fetchOffers('exemple-career', deps);

    expect(urls).toEqual(['https://exemple-career.talent-soft.com/handlers/offerRss.ashx?LCID=1036']);
    expect(offers[0]).toEqual({
      externalId: '999',
      title: 'Analyste de données H/F',
      location: 'Nanterre',
      contractType: 'cdi',
      url: 'https://exemple-career.talent-soft.com/Pages/Offre/detailoffre.aspx?idOffre=999&idOrigine=502&LCID=1036&offerReference=REF-999',
      description: 'Domaine et métier : Informatique\nVous produisez les indicateurs de pilotage.',
      postedAt: new Date('2026-09-30T15:06:21.000Z'),
    });
    expect(offers[1]).toMatchObject({
      externalId: '1001',
      title: 'Chargé de recrutement',
      contractType: 'non_precise',
    });
  });

  it('[RG-08] accepts a client sub-domain and nothing else', () => {
    expect(talentsoftAdapter.identifierSchema.parse(' Exemple-Career ')).toBe('exemple-career');
    expect(talentsoftAdapter.identifierSchema.safeParse('exemple.career').success).toBe(false);
    expect(talentsoftAdapter.identifierSchema.safeParse('../etc').success).toBe(false);
  });
});

describe('personioAdapter (EF-VEI-08, v1.33)', () => {
  it('[EF-VEI-08] reads the XML feed of a Personio career site', async () => {
    const { deps, urls } = answering(fixture('personio.xml'));

    const offers = await personioAdapter.fetchOffers('exemplia', deps);

    expect(urls).toEqual(['https://exemplia.jobs.personio.de/xml?language=fr']);
    expect(offers[0]).toEqual({
      externalId: '1000001',
      title: 'Ingénieur données H/F',
      location: 'Paris, Lille',
      contractType: 'cdi',
      url: 'https://exemplia.jobs.personio.de/job/1000001',
      description: 'Vos missions\nConcevoir les flux de données.\n\nVotre profil\nPython\nSQL',
      postedAt: new Date('2026-09-01T08:00:00.000Z'),
    });
    expect(offers[1]).toMatchObject({ contractType: 'job_etudiant', description: null });
  });
});

describe('workableAdapter (EF-VEI-08, v1.33)', () => {
  it('[EF-VEI-08] reads the offers of a Workable account', async () => {
    const { deps, urls } = answering(fixture('workable.json'));

    const offers = await workableAdapter.fetchOffers('exemplia', deps);

    expect(urls).toEqual(['https://apply.workable.com/api/v1/widget/accounts/exemplia?details=true']);
    expect(offers[0]).toEqual({
      externalId: 'ABCDEF1234',
      title: 'Data engineer',
      location: 'Paris, France, Télétravail',
      contractType: 'non_precise',
      url: 'https://apply.workable.com/j/ABCDEF1234',
      description: 'Pipelines et entrepôt de données.',
      postedAt: new Date('2026-09-15T00:00:00.000Z'),
    });
    // An internship is not a contract the candidate looks for (EF-VEI-21).
    expect(offers[1]?.contractType).toBe('autre');
  });
});

describe('ashbyAdapter (EF-VEI-08, v1.33)', () => {
  it('[EF-VEI-08] reads the listed offers of an Ashby board', async () => {
    const { deps, urls } = answering(fixture('ashby.json'));

    const offers = await ashbyAdapter.fetchOffers('Exemplia', deps);

    expect(urls).toEqual(['https://api.ashbyhq.com/posting-api/job-board/Exemplia']);
    expect(offers.map((offer) => offer.externalId)).toEqual([
      '00000000-aaaa-bbbb-cccc-000000000001',
      '00000000-aaaa-bbbb-cccc-000000000002',
    ]);
    expect(offers[0]).toEqual({
      externalId: '00000000-aaaa-bbbb-cccc-000000000001',
      title: 'Analytics engineer',
      location: 'Paris, Télétravail',
      contractType: 'non_precise',
      url: 'https://jobs.ashbyhq.com/Exemplia/00000000-aaaa-bbbb-cccc-000000000001',
      description: 'Modèles dbt et tableaux de bord.',
      postedAt: new Date('2026-09-20T08:00:00.000Z'),
    });
    expect(offers[1]).toMatchObject({ contractType: 'autre', description: 'Six mois.' });
  });

  it('[RG-08] keeps the case of the board name, and refuses anything outside its pattern', () => {
    expect(ashbyAdapter.identifierSchema.parse('Exemplia')).toBe('Exemplia');
    expect(ashbyAdapter.identifierSchema.safeParse('a/b').success).toBe(false);
  });
});
