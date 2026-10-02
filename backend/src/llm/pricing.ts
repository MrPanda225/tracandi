import type { ProviderName } from './types.js';

/**
 * ENF-COU-02: the providers whose calls cost nothing. A call to one of them is journaled in `llm_calls` like the
 * others, at 0 €, and stays out of the 10 € a month of ENF-COU-01; the monthly cost (EF-CFG-03, T-705) reads this set.
 */
export const FREE_PROVIDERS: ReadonlySet<ProviderName> = new Set<ProviderName>(['local']);

/** @req ENF-COU-02 */
export const isFreeProvider = (provider: ProviderName): boolean => FREE_PROVIDERS.has(provider);
