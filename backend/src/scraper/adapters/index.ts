import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import { recruiteeAdapter } from './recruitee.js';
import { smartrecruitersAdapter } from './smartrecruiters.js';
import { workdayAdapter } from './workday.js';
import type { SiteAdapterId, SourceAdapter } from './types.js';

/**
 * Registry of the source types of the watch. Adding a type means writing its file beside this one and adding it
 * here: nothing else in the application names a source type (ENF-MAI-03).
 *
 * The generic career page (`generic`) reads a site through the AI and arrives with T-403; until then a source of
 * that type has no adapter and its check reports as much, instead of being silently skipped.
 * @req EF-VEI-08
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  smartrecruitersAdapter,
  recruiteeAdapter,
  workdayAdapter,
];

const BY_ID = new Map<SiteAdapterId, SourceAdapter>(SOURCE_ADAPTERS.map((adapter) => [adapter.id, adapter]));

/** The adapter of a source type, or undefined when no adapter answers for it yet. */
export const adapterFor = (id: SiteAdapterId): SourceAdapter | undefined => BY_ID.get(id);

export * from './types.js';
export { contractTypeOf, htmlToText } from './description.js';
