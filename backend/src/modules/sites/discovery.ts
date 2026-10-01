import type { Database } from '../../db/client.js';
import type { RunCounters } from '../../jobs/queue.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import { adapterFor } from '../../scraper/adapters/index.js';
import type { AdapterDeps } from '../../scraper/adapters/types.js';
import { type DetectedSource, detectSource } from '../../scraper/atsFingerprint.js';
import { careerLinkOf } from '../../scraper/careerLink.js';
import type { CollectedPage } from '../../scraper/http.js';
import { readPage } from '../../scraper/page.js';
import * as repository from './repository.js';
import type { SuggestionReader } from './suggestions.js';

const HTTP_OK = 200;
/** ENF-COL-02: companies searched in one execution; each costs up to four requests, three seconds apart per host. */
export const COMPANIES_PER_SEARCH = 20;

export interface SourceDiscovery {
  /**
   * EF-VEI-38 to EF-VEI-40: looks for the career page of the companies proposed to the candidate, the ones never
   * searched first, and records what it found. Nothing is added to the watch (RG-19).
   * @returns the counters of the execution: companies searched, sources verified.
   */
  run: (userId: number, report: (counters: RunCounters) => void) => Promise<RunCounters>;
}

export interface SourceDiscoveryDeps {
  db: Database;
  clock: Clock;
  /** The responsible collector of T-401: robots.txt, three seconds per host (ENF-COL-01 to 04). */
  collect: AdapterDeps['fetch'];
  suggestions: SuggestionReader;
  logger: Logger;
}

/** A page read, or null when it could not be: a missing site is a conclusion, not a failure of the search. */
const readOrNull = async (collect: AdapterDeps['fetch'], url: string): Promise<CollectedPage | null> => {
  try {
    const page = await collect(url);
    return page.status === HTTP_OK ? page : null;
  } catch {
    return null;
  }
};

/** A career page, kept only when its address passes RG-08 for a career page. */
const careerPageSource = (url: string): DetectedSource | null => {
  const read = adapterFor('generic').identifierSchema.safeParse(url);
  return read.success ? { adapter: 'generic', identifier: read.data } : null;
};

/**
 * EF-VEI-38, RG-27: the source a company's site points at — the software found on its home page, else on the career
 * page its home page links to (one hop, EF-VEI-27), else that career page itself.
 */
const findSource = async (collect: AdapterDeps['fetch'], domain: string): Promise<DetectedSource | null> => {
  const home =
    (await readOrNull(collect, `https://${domain}/`)) ??
    (await readOrNull(collect, `https://www.${domain}/`));
  if (!home) return null;
  const direct = detectSource(home.body);
  if (direct) return direct;
  const careerUrl = careerLinkOf(readPage(home.body, home.url).links, home.url);
  if (!careerUrl) return null;
  const career = await readOrNull(collect, careerUrl);
  return (career ? detectSource(career.body) : null) ?? careerPageSource(careerUrl);
};

/**
 * EF-VEI-39: a source found is read once. Without a model: a career page that publishes no tagged offer stays « to
 * confirm » rather than costing an AI call per company (ENF-COU-01).
 */
const verify = async (
  collect: AdapterDeps['fetch'],
  source: DetectedSource,
): Promise<{ status: 'verified' | 'unconfirmed'; offerCount: number | null }> => {
  try {
    const offers = await adapterFor(source.adapter).fetchOffers(source.identifier, { fetch: collect });
    return { status: 'verified', offerCount: offers.length };
  } catch {
    return { status: 'unconfirmed', offerCount: null };
  }
};

/** EF-VEI-38 to EF-VEI-40: the search of the career pages, run in the queue. */
export const createSourceDiscovery = ({
  db,
  clock,
  collect,
  suggestions,
  logger,
}: SourceDiscoveryDeps): SourceDiscovery => ({
  async run(userId, report) {
    const proposed = await suggestions.list(userId);
    // Never searched first, then the oldest searches: a second run goes on where the first stopped.
    const pending = [...proposed]
      .sort((left, right) => (left.discoveredAt ?? '').localeCompare(right.discoveredAt ?? ''))
      .slice(0, COMPANIES_PER_SEARCH);
    const counters = { companies_searched: 0, sources_verified: 0 };
    for (const company of pending) {
      const found = await findSource(collect, company.domain);
      const checked = found
        ? await verify(collect, found)
        : { status: 'not_found' as const, offerCount: null };
      await repository.saveDiscovery(db, {
        companyId: company.companyId,
        status: checked.status,
        adapter: found?.adapter ?? null,
        identifier: found?.identifier ?? null,
        offerCount: checked.offerCount,
        discoveredAt: clock(),
      });
      counters.companies_searched += 1;
      if (checked.status === 'verified') counters.sources_verified += 1;
      report({ ...counters });
    }
    logger.info('career pages searched', { userId, ...counters });
    return counters;
  },
});
