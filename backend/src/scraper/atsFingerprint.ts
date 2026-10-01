import { adapterFor } from './adapters/index.js';
import type { SiteAdapterId } from './adapters/types.js';

/** A source a page points at: its type and the identifier the candidate would have typed (RG-08). */
export interface DetectedSource {
  adapter: SiteAdapterId;
  identifier: string;
}

/**
 * RG-27: sub-domains of an ATS that are its own machinery, never the name of a customer — the six of the rule, and
 * the editors' own career sites (« career.teamtailor.com » lists Teamtailor's offers, not a customer's).
 */
const TECHNICAL_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'cdn',
  'assets',
  'static',
  'career',
  'careers',
  'jobs',
]);
/** « /fr-FR/… » opens many Workday addresses: a locale is not the name of the career site. */
const LOCALE_SEGMENT = /^[a-z]{2}(-[a-z]{2})?$/iu;
// Absolute and protocol-relative addresses, in attributes, scripts or inline configuration alike.
const ADDRESSES = /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'<>\\)]*)?/giu;
const MAX_ADDRESSES = 2000;

type Reader = (url: URL) => DetectedSource | null;

/** A path segment as typed; a malformed escape is kept as it is rather than failing the whole page. */
const decoded = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const segmentsOf = (url: URL): string[] =>
  url.pathname
    .split('/')
    .filter((part) => part !== '')
    .map(decoded);

/** `‹customer›.‹suffix›`: the customer, unless it is a technical sub-domain. */
const customerOf = (url: URL, suffix: string): string | null => {
  if (!url.hostname.endsWith(`.${suffix}`)) return null;
  const customer = url.hostname.slice(0, -suffix.length - 1);
  return customer.includes('.') || TECHNICAL_SUBDOMAINS.has(customer) ? null : customer;
};

const bySubdomain =
  (adapter: SiteAdapterId, ...suffixes: string[]): Reader =>
  (url) => {
    const customer = suffixes.map((suffix) => customerOf(url, suffix)).find(Boolean);
    return customer ? { adapter, identifier: customer } : null;
  };

const byFirstSegment =
  (adapter: SiteAdapterId, hosts: readonly string[], ignored: readonly string[] = []): Reader =>
  (url) => {
    if (!hosts.includes(url.hostname)) return null;
    const first = segmentsOf(url)[0];
    return first && !ignored.includes(first.toLowerCase()) ? { adapter, identifier: first } : null;
  };

/** Greenhouse also embeds its board as `…/embed/job_board?for=‹board›`. */
const greenhouse: Reader = (url) => {
  const hosts = [
    'boards.greenhouse.io',
    'job-boards.greenhouse.io',
    'boards.eu.greenhouse.io',
    'job-boards.eu.greenhouse.io',
  ];
  if (!hosts.includes(url.hostname)) return null;
  const embedded = url.searchParams.get('for');
  if (embedded) return { adapter: 'greenhouse', identifier: embedded };
  const first = segmentsOf(url)[0];
  return first && first !== 'embed' ? { adapter: 'greenhouse', identifier: first } : null;
};

/** Workday: the address of the career site itself, up to its name (RG-08). */
const workday: Reader = (url) => {
  if (!url.hostname.endsWith('.myworkdayjobs.com')) return null;
  const site = segmentsOf(url).find((segment) => !LOCALE_SEGMENT.test(segment));
  return site ? { adapter: 'workday', identifier: `https://${url.hostname}/${site}` } : null;
};

/** Software without a public feed: its page is read as a career page (EF-VEI-28 first, then the model). */
const careerPageOn =
  (host: string): Reader =>
  (url) =>
    url.hostname === host && segmentsOf(url).length > 0
      ? { adapter: 'generic', identifier: `https://${url.hostname}${url.pathname}` }
      : null;

/** RG-27, in the order of the rule. */
const READERS: readonly Reader[] = [
  greenhouse,
  byFirstSegment('lever', ['jobs.lever.co', 'jobs.eu.lever.co']),
  byFirstSegment('smartrecruiters', ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com']),
  bySubdomain('recruitee', 'recruitee.com'),
  workday,
  bySubdomain('talentsoft', 'talent-soft.com'),
  bySubdomain('teamtailor', 'teamtailor.com'),
  bySubdomain('personio', 'jobs.personio.de', 'jobs.personio.com'),
  byFirstSegment('workable', ['apply.workable.com'], ['api', 'j']),
  byFirstSegment('ashby', ['jobs.ashbyhq.com']),
  careerPageOn('careers.flatchr.io'),
];

/** A detected source, kept only when its identifier passes RG-08 for its type — normalised as the type wants it. */
const validated = (found: DetectedSource): DetectedSource | null => {
  const read = adapterFor(found.adapter).identifierSchema.safeParse(found.identifier);
  return read.success ? { adapter: found.adapter, identifier: read.data } : null;
};

const detect = (address: string): DetectedSource | null => {
  const url = URL.parse(address.startsWith('//') ? `https:${address}` : address);
  if (!url) return null;
  for (const read of READERS) {
    const found = read(url);
    if (found) return validated(found);
  }
  return null;
};

/**
 * RG-27, EF-VEI-38: the recruiting software a page points at — through its links, frames, scripts or inline
 * configuration —, the most cited one when there are several, or null when it points at none. Nothing is fetched:
 * the page was already read.
 * @req RG-27, EF-VEI-38
 */
export const detectSource = (html: string): DetectedSource | null => {
  const counts = new Map<string, { source: DetectedSource; count: number }>();
  for (const [address] of [...html.matchAll(ADDRESSES)].slice(0, MAX_ADDRESSES)) {
    const found = detect(address);
    if (!found) continue;
    const key = `${found.adapter} ${found.identifier}`;
    const known = counts.get(key);
    counts.set(key, { source: found, count: (known?.count ?? 0) + 1 });
  }
  const best = [...counts.values()].sort((left, right) => right.count - left.count)[0];
  return best?.source ?? null;
};
