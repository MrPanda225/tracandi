import { normalizeKey } from '../../lib/text.js';

/**
 * Initial job keywords of RG-10 (Q-09), given to a user at the first synchronisation. A keyword is found as a whole
 * word, or a whole run of words, whatever the case and the accents: plurals are listed apart, so that « cdi » never
 * matches « Cdiscount ».
 */
export const DEFAULT_JOB_KEYWORDS: readonly string[] = [
  'candidature',
  'candidatures',
  'candidat',
  'candidate',
  'entretien',
  'entretiens',
  'recrutement',
  'recruteur',
  'recruteurs',
  'embauche',
  'emploi',
  'emplois',
  'alternance',
  'cdi',
  'cdd',
  'job',
  'jobs',
  'your application',
  'job application',
  'interview',
  'hiring',
  'recruiter',
  'recruitment',
  'recruiting',
];

/** An intermediary platform (glossary: job board or recruitment firm) and the domains it writes from. */
export interface KnownPlatform {
  name: string;
  domains: readonly string[];
}

/**
 * Initial known platforms of RG-10 (Q-09). A message from one of these domains, or from a sub-domain, is kept even
 * without keyword. LinkedIn is left out on purpose: most of its messages are social notifications, and its job
 * messages carry keywords.
 */
export const KNOWN_PLATFORMS: readonly KnownPlatform[] = [
  { name: 'APEC', domains: ['apec.fr'] },
  { name: 'LHH', domains: ['lhh.com'] },
  { name: 'Indeed', domains: ['indeed.com', 'indeed.fr', 'indeedemail.com'] },
  { name: 'HelloWork', domains: ['hellowork.com', 'regionsjob.com'] },
  { name: 'France Travail', domains: ['francetravail.fr', 'pole-emploi.fr'] },
  { name: 'Welcome to the Jungle', domains: ['welcometothejungle.com'] },
  { name: 'JobTeaser', domains: ['jobteaser.com'] },
  { name: 'Meteojob', domains: ['meteojob.com'] },
  { name: 'Cadremploi', domains: ['cadremploi.fr'] },
  { name: 'Monster', domains: ['monster.fr'] },
  { name: 'StudentJob', domains: ['studentjob.fr'] },
  { name: 'Adecco', domains: ['adecco.fr'] },
  { name: 'Randstad', domains: ['randstad.fr'] },
  { name: 'Manpower', domains: ['manpower.fr'] },
  { name: 'Michael Page', domains: ['michaelpage.fr'] },
  { name: 'Hays', domains: ['hays.fr'] },
];

/** A recorded platform (table `platforms`). */
export interface PlatformRef {
  id: number;
  name: string;
}

/** The two lists of RG-10 for one user. */
export interface PrefilterLists {
  keywords: readonly string[];
  /** Platform by sender domain (lower case). */
  platformDomains: ReadonlyMap<string, PlatformRef>;
}

/** What the pre-filter reads of a message: metadata and excerpt only (ENF-RGP-01). */
export interface PrefilteredFields {
  fromAddress: string | null;
  subject: string | null;
  snippet: string;
}

export interface Prefilter {
  /** The known platform the address writes for, or null (EF-GML-10). */
  platformOf: (fromAddress: string | null) => PlatformRef | null;
  /** RG-10: kept for the classification when the subject or the excerpt holds a keyword, or the sender is a platform. */
  isRetained: (message: PrefilteredFields) => boolean;
}

// A domain has at least two labels: « fr » alone never designates a platform.
const MIN_DOMAIN_LABELS = 2;

const domainOf = (address: string): string | null => {
  const at = address.lastIndexOf('@');
  return at < 0 ? null : address.slice(at + 1).toLowerCase();
};

/** The domain and each parent domain of it, longest first: « a.mail.apec.fr », « mail.apec.fr », « apec.fr ». */
const domainAndParents = (domain: string): string[] => {
  const labels = domain.split('.');
  return labels
    .slice(0, labels.length - MIN_DOMAIN_LABELS + 1)
    .map((_, index) => labels.slice(index).join('.'));
};

/**
 * RG-10 pre-filter, without any AI call (EF-GML-07). Keywords and texts are compared by their RG-14 key, between
 * spaces, so that a keyword only matches whole words.
 * @req RG-10, EF-GML-07, EF-GML-10
 */
export const createPrefilter = ({ keywords, platformDomains }: PrefilterLists): Prefilter => {
  const keywordKeys = keywords.map(normalizeKey).filter((key) => key !== '');
  const holdsKeyword = (text: string): boolean => {
    const padded = ` ${normalizeKey(text)} `;
    return keywordKeys.some((key) => padded.includes(` ${key} `));
  };

  const platformOf = (fromAddress: string | null): PlatformRef | null => {
    const domain = fromAddress ? domainOf(fromAddress) : null;
    if (!domain) return null;
    const known = domainAndParents(domain).find((candidate) => platformDomains.has(candidate));
    return known === undefined ? null : (platformDomains.get(known) ?? null);
  };

  return {
    platformOf,
    isRetained: ({ fromAddress, subject, snippet }) =>
      holdsKeyword(`${subject ?? ''}\n${snippet}`) || platformOf(fromAddress) !== null,
  };
};
