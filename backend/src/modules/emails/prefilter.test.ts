import { describe, expect, it } from 'vitest';
import { createPrefilter, DEFAULT_JOB_KEYWORDS, KNOWN_PLATFORMS } from './prefilter.js';

const APEC_ID = 7;
const INDEED_ID = 9;

const prefilter = createPrefilter({
  keywords: ['candidature', 'offre d’emploi', 'CDI'],
  platformDomains: new Map([
    ['apec.fr', APEC_ID],
    ['indeedemail.com', INDEED_ID],
  ]),
});

const message = (fields: { fromAddress?: string | null; subject?: string | null; snippet?: string }) => ({
  fromAddress: 'noreply@shop.example',
  subject: null,
  snippet: '',
  ...fields,
});

describe('createPrefilter — job keywords (RG-10)', () => {
  it.each([
    ['in the subject', { subject: 'Votre candidature chez Atelier Nova' }],
    ['in the excerpt', { snippet: 'Nous avons bien reçu votre candidature.' }],
    ['whatever the case and the accents', { subject: 'CANDIDATURE — équipier' }],
    ['written over several words', { snippet: 'Une nouvelle offre d’emploi correspond à votre profil' }],
    ['next to punctuation', { subject: 'Poste en CDI!' }],
  ])('[RG-10] keeps a message holding a keyword %s', (_case, fields) => {
    expect(prefilter.isRetained(message(fields))).toBe(true);
  });

  it.each([
    ['inside a longer word', { subject: 'Les soldes Cdiscount commencent' }],
    ['with another ending', { subject: 'Vos candidatures du mois' }],
    [
      'absent',
      { subject: 'Votre relevé de compte est disponible', snippet: 'Connectez-vous à votre espace client.' },
    ],
  ])('[RG-10] [EF-GML-07] sets aside a message whose keyword is %s', (_case, fields) => {
    expect(prefilter.isRetained(message(fields))).toBe(false);
  });

  it('[RG-10] ignores a keyword without letters or digits', () => {
    const withBlank = createPrefilter({ keywords: ['—', ' '], platformDomains: new Map() });

    expect(withBlank.isRetained(message({ subject: 'Bonjour — à bientôt' }))).toBe(false);
  });
});

describe('createPrefilter — known platforms (RG-10, EF-GML-10)', () => {
  it('[RG-10] keeps a message from a known platform, even without keyword', () => {
    expect(
      prefilter.isRetained(
        message({ fromAddress: 'ne-pas-repondre@apec.fr', subject: 'Un recruteur a vu votre profil' }),
      ),
    ).toBe(true);
  });

  it.each([
    ['its domain', 'ne-pas-repondre@apec.fr', APEC_ID],
    ['a sub-domain', 'alertes@mail.apec.fr', APEC_ID],
    ['whatever the case', 'Reply@IndeedEmail.com', INDEED_ID],
  ])('[EF-GML-10] recognises a platform sender by %s', (_case, address, platformId) => {
    expect(prefilter.platformOf(address)).toBe(platformId);
  });

  it.each([
    ['another domain ending the same way', 'contact@notapec.fr'],
    ['the top-level domain alone', 'someone@fr'],
    ['no address', null],
    ['an address without domain', 'apec.fr'],
  ])('[EF-GML-10] knows no platform for %s', (_case, address) => {
    expect(prefilter.platformOf(address)).toBeNull();
  });
});

describe('initial lists (Q-09)', () => {
  const defaults = createPrefilter({ keywords: DEFAULT_JOB_KEYWORDS, platformDomains: new Map() });

  it.each([
    'Nous avons bien reçu votre candidature',
    'Invitation à un entretien',
    'Thank you for your application',
    'Interview invitation — Data analyst',
    'Contrat en alternance : votre dossier',
    'Accusé de réception — Alternance Data Analyst',
  ])('[RG-10] keeps « %s » with the initial keywords', (subject) => {
    expect(defaults.isRetained(message({ subject }))).toBe(true);
  });

  it.each([
    'Votre relevé de compte de septembre est disponible',
    'Votre colis a été remis à La Poste',
    'Téléchargez notre application mobile',
  ])('[EF-GML-07] sets aside « %s » with the initial keywords', (subject) => {
    expect(defaults.isRetained(message({ subject }))).toBe(false);
  });

  it('[EF-GML-10] lists the platforms of the glossary, each with at least one domain', () => {
    const names = KNOWN_PLATFORMS.map((platform) => platform.name);

    expect(names).toEqual(expect.arrayContaining(['APEC', 'LHH', 'Indeed', 'HelloWork']));
    for (const platform of KNOWN_PLATFORMS) expect(platform.domains.length).toBeGreaterThan(0);
    const domains = KNOWN_PLATFORMS.flatMap((platform) => platform.domains);
    expect(new Set(domains).size).toBe(domains.length);
  });
});
