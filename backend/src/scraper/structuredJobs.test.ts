import { describe, expect, it } from 'vitest';
import {
  addressOf,
  employmentOf,
  identifierOf,
  placeOf,
  readStructuredJobs,
  type JobPosting,
} from './structuredJobs.js';

const posting = (changes: Record<string, unknown> = {}) => ({
  '@context': 'https://schema.org/',
  '@type': 'JobPosting',
  title: 'Data Analyst',
  datePosted: '2026-09-18',
  employmentType: 'FULL_TIME',
  url: 'https://atelier-aurore.fr/offres/data-analyst',
  jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: 'Paris' } },
  ...changes,
});

const block = (value: unknown) => JSON.stringify(value);

describe('readStructuredJobs — EF-VEI-28', () => {
  it('[EF-VEI-28] reads an offer a page marks up for search engines', () => {
    const found = readStructuredJobs([block(posting())]);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: 'Data Analyst', datePosted: '2026-09-18' });
  });

  it.each([
    ['a list at the root', (one: unknown, two: unknown) => [one, two]],
    [
      'a @graph',
      (one: unknown, two: unknown) => ({ '@context': 'https://schema.org/', '@graph': [one, two] }),
    ],
    [
      'the state of a single-page application',
      (one: unknown, two: unknown) => ({ props: { pageProps: { jobs: [one, { nested: two }] } } }),
    ],
  ])('[EF-VEI-28] finds the offers inside %s', (_case, wrap) => {
    const found = readStructuredJobs([block(wrap(posting(), posting({ title: 'Data Engineer' })))]);

    expect(found.map((job) => job.title)).toEqual(['Data Analyst', 'Data Engineer']);
  });

  it('[EF-VEI-28] accepts a type declared as a list, as schema.org allows', () => {
    const found = readStructuredJobs([block(posting({ '@type': ['JobPosting', 'Thing'] }))]);

    expect(found).toHaveLength(1);
  });

  it('[EF-VEI-28] leaves alone what a page marks up that is not an offer', () => {
    const page = { '@type': 'Organization', name: 'Atelier Aurore', address: 'Paris' };

    expect(readStructuredJobs([block(page)])).toEqual([]);
  });

  it('[ENF-FIA-02] ignores a malformed block without losing the others', () => {
    const found = readStructuredJobs(['{ ceci n’est pas du JSON', block(posting())]);

    expect(found).toHaveLength(1);
  });

  it('[EF-IA-03] drops an offer the schema refuses, and keeps the rest', () => {
    const found = readStructuredJobs([block([posting({ title: '' }), posting({ title: 'Data Engineer' })])]);

    expect(found.map((job) => job.title)).toEqual(['Data Engineer']);
  });

  it('[EF-VEI-28] stops at a bounded number of offers, whatever the page carries', () => {
    const many = Array.from({ length: 200 }, (_item, index) => posting({ title: `Poste ${String(index)}` }));

    expect(readStructuredJobs([block(many)]).length).toBeLessThanOrEqual(60);
  });

  it('[EF-VEI-28] does not sink into a deeply nested state', () => {
    let deep: unknown = posting();
    for (let level = 0; level < 40; level += 1) deep = { level: deep };

    // Rien n'est trouvé au-delà de la profondeur admise, et surtout rien ne tourne indéfiniment.
    expect(readStructuredJobs([block(deep)])).toEqual([]);
  });
});

describe('placeOf — EF-VEI-28', () => {
  it.each([
    [
      'a postal address',
      { address: { addressLocality: 'Paris', addressRegion: 'Île-de-France' } },
      'Paris, Île-de-France',
    ],
    ['an address written plainly', { address: '12 rue des Lilas, Nantes' }, '12 rue des Lilas, Nantes'],
    ['the name of the place alone', { name: 'Siège de Lyon' }, 'Siège de Lyon'],
  ])('[EF-VEI-28] reads the place from %s', (_case, place, expected) => {
    expect(placeOf(posting({ jobLocation: place }) as unknown as JobPosting)).toBe(expected);
  });

  it('[EF-VEI-28] reads the first place when the offer names several', () => {
    const several = posting({
      jobLocation: [{ address: { addressLocality: 'Paris' } }, { address: { addressLocality: 'Lyon' } }],
    });

    expect(placeOf(several as unknown as JobPosting)).toBe('Paris');
  });

  it('[EF-VEI-28] says « Télétravail » when the offer only declares itself remote', () => {
    const remote = posting({ jobLocation: null, jobLocationType: 'TELECOMMUTE' });

    expect(placeOf(remote as unknown as JobPosting)).toBe('Télétravail');
  });

  it('[EF-VEI-28] says nothing when the offer names no place at all', () => {
    expect(placeOf(posting({ jobLocation: null }) as unknown as JobPosting)).toBeNull();
  });
});

describe('employmentOf, addressOf, identifierOf — EF-VEI-28', () => {
  it('[EF-VEI-28] reads the contract whether it is written once or several times', () => {
    expect(employmentOf(posting() as unknown as JobPosting)).toBe('FULL_TIME');
    expect(
      employmentOf(posting({ employmentType: ['CONTRACTOR', 'PART_TIME'] }) as unknown as JobPosting),
    ).toBe('CONTRACTOR');
  });

  it('[EF-VEI-28] falls back on @id when the offer declares no url', () => {
    const byId = posting({ url: null, '@id': 'https://atelier-aurore.fr/offres/1' });

    expect(addressOf(byId as unknown as JobPosting)).toBe('https://atelier-aurore.fr/offres/1');
  });

  it('[EF-VEI-09] reads the identifier the source gives, however it writes it', () => {
    expect(identifierOf(posting({ identifier: 'JR-10023' }) as unknown as JobPosting)).toBe('JR-10023');
    expect(identifierOf(posting({ identifier: { value: 4512 } }) as unknown as JobPosting)).toBe('4512');
    expect(identifierOf(posting() as unknown as JobPosting)).toBeNull();
  });
});
