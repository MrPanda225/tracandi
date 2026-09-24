import type { SiteAdapterId } from '../../scraper/adapters/types.js';
import { adapterOfSenderDomain, isCompanyDomain } from '../emails/domains.js';

// RG-19 : les domaines qui désignent une entreprise sont connus du module des messages, toujours actif.
export { adapterOfSenderDomain, domainOfAddress, isCompanyDomain } from '../emails/domains.js';

/** Un domaine vu dans les messages d'une entreprise, et le nombre de messages qui en viennent. */
export interface SeenDomain {
  domain: string;
  count: number;
}

/**
 * RG-19 : le domaine à proposer pour une entreprise — le plus fréquent de ses expéditeurs qui la désigne
 * vraiment. À égalité, l'ordre alphabétique tranche, pour que deux appels donnent la même réponse.
 */
export const chooseCompanyDomain = (
  seen: readonly SeenDomain[],
  platformDomains: ReadonlySet<string>,
): string | null => {
  const kept = seen.filter((entry) => isCompanyDomain(entry.domain, platformDomains));
  const best = [...kept].sort(
    (left, right) => right.count - left.count || left.domain.localeCompare(right.domain),
  );
  return best[0]?.domain ?? null;
};

/**
 * EF-VEI-24 : le type de source à proposer, d'après les expéditeurs vus. Un ATS reconnu l'emporte ; à défaut,
 * c'est la page carrières, lue en dernier recours (rules/scraping.md).
 */
export const chooseAdapter = (seen: readonly SeenDomain[]): SiteAdapterId => {
  const byFrequency = [...seen].sort(
    (left, right) => right.count - left.count || left.domain.localeCompare(right.domain),
  );
  for (const entry of byFrequency) {
    const adapter = adapterOfSenderDomain(entry.domain);
    if (adapter) return adapter;
  }
  return 'generic';
};
