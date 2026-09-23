import { genericAdapter } from './generic.js';
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
 * The generic career page (`generic`) comes last on purpose: it is the fallback for a company that runs no ATS
 * job board, and it costs one AI call per check where the others cost none.
 * @req EF-VEI-08
 */
export const SOURCE_ADAPTERS: readonly SourceAdapter[] = [
  greenhouseAdapter,
  leverAdapter,
  smartrecruitersAdapter,
  recruiteeAdapter,
  workdayAdapter,
  genericAdapter,
];

const BY_ID = new Map<SiteAdapterId, SourceAdapter>(SOURCE_ADAPTERS.map((adapter) => [adapter.id, adapter]));

/**
 * The adapter of a source type. Every value of the enumeration has one, so a caller never has to handle an
 * absence; a value added to the enumeration without its adapter fails here rather than silently skipping a source.
 */
export const adapterFor = (id: SiteAdapterId): SourceAdapter => {
  const adapter = BY_ID.get(id);
  if (!adapter) throw new Error(`no adapter answers for source type ${id}`);
  return adapter;
};

export * from './types.js';
export { contractTypeOf, htmlToText } from './description.js';
