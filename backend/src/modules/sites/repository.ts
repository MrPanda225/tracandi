import { and, count, eq, exists, isNull, lt, notExists, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import {
  applications,
  companies,
  discoveredSources,
  dismissedSourceSuggestions,
  emails,
  jobOffers,
  platformDomains,
  watchedSites,
} from '../../db/schema.js';
import type { NormalizedOffer, SiteAdapterId } from '../../scraper/adapters/types.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Database or open transaction: repository functions work with both. */
export type Executor = Database | Transaction;

/** A watched source with the name of its company and how many offers it has produced. */
export interface SourceRow {
  id: number;
  /** Null for an official source (EF-VEI-32), which has no company of its own. */
  companyId: number | null;
  companyName: string | null;
  adapter: SiteAdapterId;
  identifier: string;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastError: string | null;
  offerCount: number;
}

// EF-AUT-06: a source carries its owner (v1.33), official sources included.
const ownedBy = (userId: number) => eq(watchedSites.userId, userId);

/**
 * ENF-PERF-04: counted by a correlated subquery rather than a join, which the planner serves from
 * `uq_job_offers_source_item` (site_id first) one source at a time. Joining and grouping made it read the whole
 * of `job_offers` for a list of a dozen sources.
 */
const offerCount = sql<number>`(
  select count(*)::int from ${jobOffers} where ${jobOffers.siteId} = ${watchedSites.id}
)`;

const sourceColumns = {
  id: watchedSites.id,
  companyId: watchedSites.companyId,
  companyName: companies.name,
  adapter: watchedSites.adapter,
  identifier: watchedSites.identifier,
  isActive: watchedSites.isActive,
  lastCheckedAt: watchedSites.lastCheckedAt,
  lastError: watchedSites.lastError,
  offerCount,
};

const selectSources = (db: Executor) =>
  db.select(sourceColumns).from(watchedSites).leftJoin(companies, eq(companies.id, watchedSites.companyId));

/**
 * The user's watched sources, company first then identifier, with their offer count.
 * @req EF-VEI-01, EF-AUT-06
 */
export const listSources = async (db: Executor, userId: number): Promise<SourceRow[]> =>
  selectSources(db)
    .where(ownedBy(userId))
    .orderBy(sql`${companies.name} nulls first`, watchedSites.identifier);

/** One source of the user, or undefined when it is another user's or does not exist (EF-AUT-06). */
export const findSource = async (db: Executor, userId: number, id: number): Promise<SourceRow | undefined> =>
  (await selectSources(db).where(and(ownedBy(userId), eq(watchedSites.id, id))))[0];

/** The active sources of the user, as one pass of the watch reads them (EF-VEI-04, EF-VEI-07). */
export const listActiveSources = async (db: Executor, userId: number): Promise<SourceRow[]> =>
  selectSources(db)
    .where(and(ownedBy(userId), eq(watchedSites.isActive, true)))
    .orderBy(watchedSites.id);

/** Every user whose watch has at least one active source, for the scheduled pass (EF-VEI-06). */
export const listUsersWithActiveSources = async (db: Executor): Promise<number[]> => {
  const rows = await db
    .selectDistinct({ userId: watchedSites.userId })
    .from(watchedSites)
    .where(eq(watchedSites.isActive, true));
  return rows.map((row) => row.userId);
};

/**
 * Adds a source.
 * @throws the unique violation of `uq_watched_sites_source` when it is already watched (EF-VEI-03).
 * @req EF-VEI-01, EF-VEI-03
 */
export const insertSource = async (
  db: Executor,
  source: { userId: number; companyId: number | null; adapter: SiteAdapterId; identifier: string },
): Promise<number> => {
  const [row] = await db.insert(watchedSites).values(source).returning({ id: watchedSites.id });
  if (!row) throw new Error('watched site insert returned no row');
  return row.id;
};

/** EF-VEI-04: suspends or reactivates a source of the user. */
export const setSourceActive = async (
  db: Executor,
  change: { userId: number; id: number; isActive: boolean },
): Promise<void> => {
  await db
    .update(watchedSites)
    .set({ isActive: change.isActive })
    .where(and(eq(watchedSites.id, change.id), ownedBy(change.userId)));
};

/** EF-VEI-05: removes a source of the user; its offers go with it (`on delete cascade`). */
export const deleteSource = async (db: Executor, userId: number, id: number): Promise<void> => {
  await db.delete(watchedSites).where(and(eq(watchedSites.id, id), ownedBy(userId)));
};

/** EF-VEI-10, EF-VEI-11: what the last check of a source left behind, kept whether it worked or not. */
export const recordCheck = async (
  db: Executor,
  id: number,
  outcome: { checkedAt: Date; error: string | null },
): Promise<void> => {
  await db
    .update(watchedSites)
    .set({ lastCheckedAt: outcome.checkedAt, lastError: outcome.error })
    .where(eq(watchedSites.id, id));
};

/** The identifiers a source has already produced, to leave its known offers alone (EF-VEI-09). */
export const listKnownOfferIds = async (db: Executor, siteId: number): Promise<Set<string>> => {
  const rows = await db
    .select({ externalId: jobOffers.externalId })
    .from(jobOffers)
    .where(eq(jobOffers.siteId, siteId));
  return new Set(rows.map((row) => row.externalId));
};

/** An offer about to be stored: what the adapter read, plus what the scoring decided. */
export interface OfferToStore extends NormalizedOffer {
  relevanceScore: number;
  relevanceReason: string | null;
  matchedTarget: string | null;
}

/**
 * Stores the offers a source produced and this user does not have yet. A concurrent pass that stored the same
 * offer first is not an error: the row is left as it is (`uq_job_offers_source_item`).
 * @returns how many rows were actually added.
 * @req EF-VEI-09, EF-VEI-12, EF-VEI-21
 */
export const insertOffers = async (
  db: Executor,
  siteId: number,
  offers: readonly OfferToStore[],
): Promise<number> => {
  if (offers.length === 0) return 0;
  const rows = await db
    .insert(jobOffers)
    .values(
      offers.map((offer) => ({
        siteId,
        externalId: offer.externalId,
        companyName: offer.employerName ?? null,
        companySiren: offer.employerSiren ?? null,
        title: offer.title,
        location: offer.location,
        contractType: offer.contractType,
        url: offer.url,
        description: offer.description,
        postedAt: offer.postedAt,
        relevanceScore: offer.relevanceScore,
        relevanceReason: offer.relevanceReason,
        matchedTarget: offer.matchedTarget,
      })),
    )
    .onConflictDoNothing({ target: [jobOffers.siteId, jobOffers.externalId] })
    .returning({ id: jobOffers.id });
  return rows.length;
};

/** Une entreprise sans source, et les domaines d'où elle a écrit au candidat (RG-19). */
export interface SuggestionRow {
  companyId: number;
  companyName: string;
  domain: string;
  messages: number;
}

/**
 * EF-VEI-23 : les domaines des messages **reçus** rattachés aux candidatures du candidat, pour les entreprises
 * qu'il ne surveille pas encore et dont il n'a pas écarté la proposition. Un domaine par ligne, avec le nombre de
 * messages qui en viennent ; le choix entre eux est une règle, pas une requête (RG-19).
 *
 * Seule l'adresse de l'expéditeur est lue : jamais le corps, dont 300 caractères seulement sont conservés
 * (ENF-RGP-01).
 * @req EF-VEI-23, EF-VEI-25, RG-19, EF-AUT-06
 */
export const listSuggestionDomains = async (db: Executor, userId: number): Promise<SuggestionRow[]> => {
  const domain = sql<string>`lower(split_part(${emails.fromAddress}, '@', 2))`;
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      domain,
      messages: count(emails.id),
    })
    .from(emails)
    .innerJoin(applications, eq(applications.id, emails.applicationId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(
      and(
        /* ENF-PERF-04 : redondant avec `companies.user_id`, mais c'est lui qui ouvre `ix_emails_user_thread` ;
           sans cette borne, le planificateur lisait toute la table `emails`. */
        eq(emails.userId, userId),
        eq(companies.userId, userId),
        eq(emails.direction, 'inbound'),
        sql`${emails.fromAddress} like '%@%'`,
        // Une entreprise déjà surveillée n'a rien à proposer, quelle que soit la source (EF-VEI-23).
        notExists(
          db
            .select({ one: sql`1` })
            .from(watchedSites)
            .where(eq(watchedSites.companyId, companies.id)),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(dismissedSourceSuggestions)
            .where(
              and(
                eq(dismissedSourceSuggestions.userId, userId),
                eq(dismissedSourceSuggestions.companyId, companies.id),
              ),
            ),
        ),
      ),
    )
    .groupBy(companies.id, companies.name, domain);
  return rows;
};

/** Les domaines des plateformes connues, pour les écarter d'une proposition (RG-19). */
export const listPlatformDomains = async (db: Executor): Promise<Set<string>> => {
  const rows = await db.select({ domain: platformDomains.domain }).from(platformDomains);
  return new Set(rows.map((row) => row.domain.toLowerCase()));
};

/**
 * EF-VEI-25 : retient qu'une proposition a été écartée. Deux refus de suite ne sont pas une erreur.
 * @returns faux quand l'entreprise n'est pas celle du candidat (EF-AUT-06).
 */
export const dismissSuggestion = async (db: Executor, userId: number, companyId: number): Promise<boolean> => {
  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.userId, userId)));
  if (owned.length === 0) return false;
  await db
    .insert(dismissedSourceSuggestions)
    .values({ userId, companyId })
    .onConflictDoNothing({ target: [dismissedSourceSuggestions.userId, dismissedSourceSuggestions.companyId] });
  return true;
};

/**
 * EF-VEI-36: the companies of the user's applications whose SIREN is unknown and was not looked for since `before`,
 * the oldest looked for first — at most `limit`, so that one pass never asks about them all at once.
 * @req EF-VEI-36, EF-AUT-06
 */
export const listCompaniesToIdentify = async (
  db: Executor,
  userId: number,
  { before, limit }: { before: Date; limit: number },
): Promise<{ id: number; name: string }[]> =>
  db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(
      and(
        eq(companies.userId, userId),
        isNull(companies.siren),
        or(isNull(companies.sirenCheckedAt), lt(companies.sirenCheckedAt, before)),
        exists(db.select({ id: applications.id }).from(applications).where(eq(applications.companyId, companies.id))),
      ),
    )
    .orderBy(sql`${companies.sirenCheckedAt} asc nulls first`, companies.id)
    .limit(limit);

/** EF-VEI-36: what the search of a company's SIREN found — possibly nothing — and when. */
export const recordSiren = async (
  db: Executor,
  companyId: number,
  outcome: { siren: string | null; checkedAt: Date },
): Promise<void> => {
  await db
    .update(companies)
    .set({ siren: outcome.siren, sirenCheckedAt: outcome.checkedAt })
    .where(eq(companies.id, companyId));
};

/** EF-VEI-39: what the search of a company's career page concluded. */
export interface DiscoveryRow {
  companyId: number;
  status: (typeof discoveredSources.status.enumValues)[number];
  adapter: SiteAdapterId | null;
  identifier: string | null;
  offerCount: number | null;
  discoveredAt: Date;
}

/**
 * EF-VEI-38, EF-VEI-39: the conclusions of the searches of career pages for the user's companies.
 * @req EF-VEI-38, EF-AUT-06
 */
export const listDiscoveries = async (db: Executor, userId: number): Promise<DiscoveryRow[]> =>
  db
    .select({
      companyId: discoveredSources.companyId,
      status: discoveredSources.status,
      adapter: discoveredSources.adapter,
      identifier: discoveredSources.identifier,
      offerCount: discoveredSources.offerCount,
      discoveredAt: discoveredSources.discoveredAt,
    })
    .from(discoveredSources)
    .innerJoin(companies, eq(companies.id, discoveredSources.companyId))
    .where(eq(companies.userId, userId));

/** EF-VEI-39: records — or replaces — what the search of this company's career page concluded. */
export const saveDiscovery = async (db: Executor, discovery: DiscoveryRow): Promise<void> => {
  await db
    .insert(discoveredSources)
    .values(discovery)
    .onConflictDoUpdate({
      target: discoveredSources.companyId,
      set: {
        status: discovery.status,
        adapter: discovery.adapter,
        identifier: discovery.identifier,
        offerCount: discovery.offerCount,
        discoveredAt: discovery.discoveredAt,
      },
    });
};
