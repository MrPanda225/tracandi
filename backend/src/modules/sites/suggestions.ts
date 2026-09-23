import type { Database } from '../../db/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { normalizeKey } from '../../lib/text.js';
import * as repository from './repository.js';
import type { SourceSuggestion } from './schemas.js';
import { chooseAdapter, chooseCompanyDomain, type SeenDomain } from './suggestion-rules.js';

const COMPANY_NOT_FOUND = 'Entreprise introuvable';

export interface SuggestionReader {
  /** @req EF-VEI-23, EF-VEI-24 */
  list: (userId: number) => Promise<SourceSuggestion[]>;
  /** @req EF-VEI-25 */
  dismiss: (userId: number, companyId: number) => Promise<void>;
}

/**
 * RG-08 : ce que l'écran pré-remplira. Une page carrières et un site Workday se désignent par une adresse, un
 * job board par un slug déduit du nom de l'entreprise — que le candidat corrigera si l'ATS l'a nommée autrement.
 */
const identifierFor = (adapter: SourceSuggestion['adapter'], domain: string, companyName: string): string =>
  adapter === 'generic' || adapter === 'workday'
    ? `https://${domain}`
    : normalizeKey(companyName).replaceAll(' ', '');

/**
 * EF-VEI-23 à EF-VEI-25 : les sources que le candidat pourrait surveiller, déduites des entreprises auxquelles
 * il a déjà postulé. **Aucune requête sortante** : tout se lit dans ce que la synchronisation Gmail a enregistré,
 * et rien n'est ajouté d'office (RG-19).
 */
export const createSuggestionReader = (db: Database): SuggestionReader => ({
  async list(userId) {
    const [rows, platforms] = await Promise.all([
      repository.listSuggestionDomains(db, userId),
      repository.listPlatformDomains(db),
    ]);
    const byCompany = new Map<number, { name: string; seen: SeenDomain[] }>();
    for (const row of rows) {
      const company = byCompany.get(row.companyId) ?? { name: row.companyName, seen: [] };
      company.seen.push({ domain: row.domain, count: row.messages });
      byCompany.set(row.companyId, company);
    }

    const suggested: SourceSuggestion[] = [];
    for (const [companyId, company] of byCompany) {
      const domain = chooseCompanyDomain(company.seen, platforms);
      // RG-19 : sans domaine qui désigne l'entreprise, il n'y a rien à proposer.
      if (domain === null) continue;
      const adapter = chooseAdapter(company.seen);
      suggested.push({
        companyId,
        companyName: company.name,
        domain,
        adapter,
        identifier: identifierFor(adapter, domain, company.name),
        messages: company.seen.find((entry) => entry.domain === domain)?.count ?? 0,
      });
    }
    // Le plus de messages d'abord : c'est l'entreprise dont le candidat attend le plus.
    return suggested.sort(
      (left, right) => right.messages - left.messages || left.companyName.localeCompare(right.companyName),
    );
  },

  async dismiss(userId, companyId) {
    if (!(await repository.dismissSuggestion(db, userId, companyId))) {
      throw new NotFoundError(COMPANY_NOT_FOUND);
    }
  },
});
