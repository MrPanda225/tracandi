import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_LINKS, PAGE_TEXT_MAX_LENGTH, readPage } from './page.js';

const PAGE = readFileSync(
  fileURLToPath(new URL('../../tests/fixtures/ats/generic-career-page.html', import.meta.url)),
  'utf8',
);
const ADDRESS = 'https://atelier-aurore.fr/nous-rejoindre';

describe('readPage', () => {
  it('[EF-VEI-08] keeps the readable text of the page and drops its code', () => {
    const { text } = readPage(PAGE, ADDRESS);

    expect(text).toContain('Atelier Aurore recrute pour son équipe données à Paris et à Nantes.');
    expect(text).toContain('Data Analyst');
    // Scripts and styles hold no offer and would only cost tokens (ENF-COU-01).
    expect(text).not.toContain('dataLayer');
    expect(text).not.toContain('#333');
    // The furniture of the site is not part of what the page says.
    expect(text).not.toContain('Mentions légales');
  });

  it('[EF-VEI-08] resolves every link against the page, so a relative address becomes checkable', () => {
    const { links } = readPage(PAGE, ADDRESS);

    expect(links).toContainEqual({
      url: 'https://atelier-aurore.fr/offres/data-analyst',
      label: 'Data Analyst',
    });
    expect(links).toContainEqual({
      url: 'https://jobs.atelier-aurore.fr/alternance-data-engineer',
      label: 'Alternance — Data Engineer',
    });
  });

  it('[EF-VEI-08] keeps the links of the furniture, where some sites list their offers', () => {
    const { links } = readPage(PAGE, ADDRESS);

    expect(links.map((link) => link.url)).toContain('https://atelier-aurore.fr/nous-rejoindre');
  });

  it('[ENF-COL-01] keeps no address that is not https', () => {
    const { links } = readPage(PAGE, ADDRESS);

    expect(links.map((link) => link.url)).not.toContain('mailto:contact@atelier-aurore.fr');
    expect(links.every((link) => link.url.startsWith('https://'))).toBe(true);
  });

  it('[EF-VEI-08] lists one address once, whatever the number of links pointing at it', () => {
    const twice = '<a href="/offres/x">Poste X</a><a href="/offres/x">Voir le poste X</a>';
    const { links } = readPage(twice, ADDRESS);

    expect(links).toEqual([{ url: 'https://atelier-aurore.fr/offres/x', label: 'Poste X' }]);
  });

  it('[ENF-COU-01] bounds what is read, whatever the size of the page', () => {
    const huge = `<body><p>${'texte '.repeat(5000)}</p>${'<a href="/o/x">Offre</a>'
      .repeat(0)
      .concat(
        Array.from(
          { length: MAX_LINKS + 20 },
          (_item, index) => `<a href="/o/${index}">Offre ${index}</a>`,
        ).join(''),
      )}</body>`;

    const { text, links } = readPage(huge, ADDRESS);

    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_LENGTH);
    expect(links).toHaveLength(MAX_LINKS);
  });
});
