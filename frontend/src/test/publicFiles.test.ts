import { describe, expect, it } from 'vitest';
import indexHtml from '../../index.html?raw';
import favicon from '../../public/favicon.svg?raw';
import llmsTxt from '../../public/llms.txt?raw';
import robotsTxt from '../../public/robots.txt?raw';

const page = new DOMParser().parseFromString(indexHtml, 'text/html');
const metaContent = (selector: string) => page.head.querySelector<HTMLMetaElement>(selector)?.content;

/** Directives of robots.txt as `[field, value]`, comments and blank lines left out. */
const directives = robotsTxt
  .split('\n')
  .map((line) => line.replace(/#.*/, '').trim())
  .filter(Boolean)
  .map((line) => {
    const separator = line.indexOf(':');
    return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()] as const;
  });

const PUBLIC_PAGES = ['/$', '/connexion', '/mentions-legales', '/confidentialite', '/cookies'];
const APPLICATION_SCREENS = ['/api/', '/candidatures', '/reglages', '/offres', '/sites', '/atelier-cv'];

describe('public files (EF-SEO-01)', () => {
  it('[EF-SEO-01] describes the service in French in the page every address starts from', () => {
    expect(page.documentElement.lang).toBe('fr');
    expect(page.title).toBe('Tracandi — suivi de candidatures depuis Gmail');
    expect(metaContent('meta[name="description"]')).toMatch(/^Tracandi lit vos e-mails de candidature.{60,}/);
    expect(metaContent('meta[name="theme-color"]')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(page.head.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('[EF-SEO-01] offers a preview when a link to the site is shared', () => {
    expect(metaContent('meta[property="og:type"]')).toBe('website');
    expect(metaContent('meta[property="og:locale"]')).toBe('fr_FR');
    expect(metaContent('meta[property="og:site_name"]')).toBe('Tracandi');
    expect(metaContent('meta[property="og:title"]')).toBeTruthy();
    expect(metaContent('meta[property="og:description"]')).toBe(metaContent('meta[name="description"]'));
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary');
  });

  it('[EF-SEO-01] keeps robots.txt to known directives only, for every crawler', () => {
    expect(directives[0]).toEqual(['user-agent', '*']);
    for (const [field] of directives) expect(['user-agent', 'allow', 'disallow']).toContain(field);
  });

  it('[EF-SEO-01] opens the public pages to crawlers and closes the application and its API', () => {
    const allowed = directives.filter(([field]) => field === 'allow').map(([, value]) => value);
    const disallowed = directives.filter(([field]) => field === 'disallow').map(([, value]) => value);

    expect(allowed).toEqual(expect.arrayContaining(PUBLIC_PAGES));
    expect(disallowed).toEqual(expect.arrayContaining(APPLICATION_SCREENS));
    expect(disallowed).not.toContain('/');
  });

  it('[EF-SEO-01] describes the service and its public pages to language models in llms.txt', () => {
    expect(llmsTxt).toMatch(/^# Tracandi\n\n> .+/);
    for (const path of ['/connexion', '/mentions-legales', '/confidentialite', '/cookies']) {
      expect(llmsTxt).toContain(`(${path})`);
    }
  });

  it('[EF-SEO-01] ships a vector icon', () => {
    expect(new DOMParser().parseFromString(favicon, 'image/svg+xml').documentElement.tagName).toBe('svg');
  });
});
