import { describe, expect, it } from 'vitest';
import { careerLinkOf } from './careerLink.js';

const HOME = 'https://suez.com/fr';

const link = (label: string, url: string) => ({ label, url });

describe('careerLinkOf — EF-VEI-27', () => {
  it.each([
    ['Carrières', 'https://suez.com/fr/carrieres'],
    ['Nous rejoindre', 'https://suez.com/fr/nous-rejoindre'],
    ['Join us', 'https://suez.com/en/join-us'],
    ['Recrutement', 'https://suez.com/fr/recrutement'],
  ])('[EF-VEI-27] follows « %s »', (label, url) => {
    const links = [
      link('Accueil', 'https://suez.com/fr'),
      link(label, url),
      link('Contact', 'https://suez.com/c'),
    ];

    expect(careerLinkOf(links, HOME)).toBe(url);
  });

  it('[EF-VEI-27] reads the address when the label says nothing', () => {
    const links = [link('En savoir plus', 'https://suez.com/fr/nos-offres')];

    expect(careerLinkOf(links, HOME)).toBe('https://suez.com/fr/nos-offres');
  });

  it('[EF-VEI-27] prefers the link that names the offers over the one that names the careers', () => {
    const links = [
      link('Carrières', 'https://suez.com/fr/carrieres'),
      link('Nos offres', 'https://suez.com/fr/offres'),
    ];

    expect(careerLinkOf(links, HOME)).toBe('https://suez.com/fr/offres');
  });

  it('[EF-VEI-27] follows a board on a subdomain of the site', () => {
    const links = [link('Nos offres', 'https://jobs.suez.com/')];

    expect(careerLinkOf(links, HOME)).toBe('https://jobs.suez.com/');
  });

  it('[ENF-SEC-06] never follows a link off the site, whatever its label says', () => {
    const links = [link('Nos offres', 'https://www.indeed.fr/cmp/suez/jobs')];

    expect(careerLinkOf(links, HOME)).toBeNull();
  });

  it.each([
    ['Candidature spontanée', 'https://suez.com/fr/candidature-spontanee'],
    ['Politique de recrutement', 'https://suez.com/fr/politique-recrutement'],
    ['Actualités emploi', 'https://suez.com/fr/actualites-emploi'],
  ])('[EF-VEI-27] leaves « %s » alone: it talks about jobs without listing any', (label, url) => {
    expect(careerLinkOf([link(label, url)], HOME)).toBeNull();
  });

  it('[EF-VEI-27] does not bounce on the page it is already reading', () => {
    const links = [link('Carrières', HOME), link('Carrières', 'https://suez.com/fr')];

    expect(careerLinkOf(links, HOME)).toBeNull();
  });

  it('[EF-VEI-27] answers nothing when the page carries no such link', () => {
    const links = [
      link('Accueil', 'https://suez.com/fr'),
      link('Nos solutions', 'https://suez.com/fr/solutions'),
    ];

    expect(careerLinkOf(links, HOME)).toBeNull();
  });
});
