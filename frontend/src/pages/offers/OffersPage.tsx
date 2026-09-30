import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAbortError, messageOf } from '../../api/client';
import {
  applyToOffer,
  fetchOfferDescription,
  fetchOffers,
  OFFERS_PAGE_SIZE,
  setOfferStatus,
  type Offer,
  type OfferQuery,
  type OfferView,
} from '../../api/offers';
import type { SourceAdapterId } from '../../api/sites';
import type { ContractType } from '../../api/stats';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { CONTRACT_LABELS, CONTRACT_TYPES, formatDate } from '../../lib/format';
import './OffersPage.css';

const VIEWS: readonly { id: OfferView; label: string }[] = [
  { id: 'active', label: 'À regarder' },
  { id: 'saved', label: 'Gardées' },
  { id: 'dismissed', label: 'Écartées' },
  { id: 'applied', label: 'Postulées' },
];

const MIN_SCORES = [40, 60, 80] as const;
const OFFICIAL_SOURCES: ReadonlySet<SourceAdapterId> = new Set(['france_travail', 'la_bonne_alternance']);
// « Non précisé », « Autre » : filtrer sur eux ne sert à rien, le filtre propose les contrats recherchés (RG-09).
const FILTERABLE_CONTRACTS = CONTRACT_TYPES.filter(
  (contract) => contract !== 'non_precise' && contract !== 'autre',
);
/** EF-VEI-14 : une offre sous ce score a été écartée sans IA ; au-dessus de l'autre, elle mérite d'être vue. */
const HIGH_SCORE = 70;
const MEDIUM_SCORE = 40;

const scoreToneOf = (score: number | null): 'high' | 'medium' | 'low' =>
  score === null || score < MEDIUM_SCORE ? 'low' : score >= HIGH_SCORE ? 'high' : 'medium';

/** Ce qui situe une offre en une ligne : entreprise, lieu, contrat, date. */
const factsOf = (offer: Offer): string =>
  [
    offer.companyName,
    offer.location,
    offer.contractType === 'non_precise' ? null : CONTRACT_LABELS[offer.contractType],
    offer.postedAt
      ? `publiée le ${formatDate(offer.postedAt)}`
      : `repérée le ${formatDate(offer.firstSeenAt)}`,
    // EF-VEI-32: an offer of an official source names its source, as its reuse licence asks.
    OFFICIAL_SOURCES.has(offer.source.adapter) ? `source : ${offer.source.label}` : null,
  ]
    .filter((fact): fact is string => fact !== null && fact !== '')
    .join(' · ');

/** EF-VEI-16 : le texte de l'offre, lu à la demande seulement — la liste reste légère. */
function OfferDescription({ offerId }: { offerId: number }) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchOfferDescription(offerId, controller.signal)
      .then(setText)
      .catch((error: unknown) => {
        if (!isAbortError(error)) setFailure(messageOf(error));
      });
    return () => controller.abort();
  }, [offerId]);

  if (failure !== null) return <p className="offer__failure">{failure}</p>;
  if (text === undefined) return <Skeleton width="80%" height="1rem" />;
  return <p className="offer__description">{text ?? 'Cette source ne publie pas le texte de ses offres.'}</p>;
}

function OfferCard({ offer, onChanged }: { offer: Offer; onChanged: (offer: Offer) => void }) {
  const detailId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const act = async (label: string, action: () => Promise<Offer>) => {
    setPending(label);
    setFailure(null);
    try {
      onChanged(await action());
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setPending(null);
    }
  };

  const tone = scoreToneOf(offer.relevanceScore);
  const isApplied = offer.status === 'applied';

  return (
    <li className="offer">
      <div className="offer__head">
        <div className="offer__main">
          <a className="offer__title" href={offer.url} target="_blank" rel="noopener noreferrer">
            {offer.title}
            <span className="visually-hidden"> (ouvre le site de l’offre)</span>
          </a>
          <p className="offer__facts">{factsOf(offer)}</p>
          {offer.isFromAppliedCompany && <p className="offer__applied-company">Vous y avez déjà postulé</p>}
        </div>
        <p className={`offer__score offer__score--${tone}`}>
          <span className="visually-hidden">Pertinence : </span>
          {offer.relevanceScore === null ? '—' : offer.relevanceScore}
          <span className="offer__score-unit" aria-hidden="true">
            /100
          </span>
          <span className="visually-hidden"> sur 100</span>
        </p>
      </div>

      {offer.relevanceReason !== null && <p className="offer__reason">{offer.relevanceReason}</p>}

      <div className="offer__actions">
        {isApplied ? (
          <p className="offer__applied">
            Candidature créée · <Link to="/candidatures">la suivre</Link>
          </p>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--small"
              disabled={pending !== null}
              aria-busy={pending === 'apply'}
              onClick={() => void act('apply', async () => (await applyToOffer(offer.id)).offer)}
            >
              {pending === 'apply' ? 'Enregistrement…' : 'J’ai postulé'}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={pending !== null}
              aria-busy={pending === 'save'}
              onClick={() =>
                void act('save', () => setOfferStatus(offer.id, offer.status === 'saved' ? 'new' : 'saved'))
              }
            >
              {offer.status === 'saved' ? 'Ne plus garder' : 'Garder'}
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              disabled={pending !== null}
              aria-busy={pending === 'dismiss'}
              onClick={() =>
                void act('dismiss', () =>
                  setOfferStatus(offer.id, offer.status === 'dismissed' ? 'new' : 'dismissed'),
                )
              }
            >
              {offer.status === 'dismissed' ? 'Remettre à regarder' : 'Écarter'}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn--quiet btn--small offer__toggle"
          aria-expanded={isOpen}
          aria-controls={detailId}
          onClick={() => setIsOpen((open) => !open)}
        >
          {isOpen ? 'Masquer le texte' : 'Lire le texte'}
        </button>
      </div>

      {failure !== null && <Flash>{failure}</Flash>}

      <div id={detailId} hidden={!isOpen}>
        {isOpen && <OfferDescription offerId={offer.id} />}
      </div>
    </li>
  );
}

function OffersFilters({ query, onChange }: { query: OfferQuery; onChange: (query: OfferQuery) => void }) {
  const scoreId = useId();
  const contractId = useId();

  return (
    <div className="offers-filters">
      <div className="offers-views" role="group" aria-label="Offres à afficher">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className="offers-views__item"
            aria-pressed={query.view === view.id}
            onClick={() => onChange({ ...query, view: view.id })}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="offers-filters__fields">
        <div className="form-field">
          <label className="form-field__label" htmlFor={scoreId}>
            Pertinence
          </label>
          <select
            id={scoreId}
            className="control"
            value={query.minScore ?? ''}
            onChange={(event) =>
              onChange({
                ...query,
                minScore: event.target.value === '' ? undefined : Number(event.target.value),
              })
            }
          >
            <option value="">Toutes</option>
            {MIN_SCORES.map((score) => (
              <option key={score} value={score}>
                {score} et plus
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={contractId}>
            Contrat
          </label>
          <select
            id={contractId}
            className="control"
            value={query.contractType ?? ''}
            onChange={(event) =>
              onChange({
                ...query,
                contractType: event.target.value === '' ? undefined : (event.target.value as ContractType),
              })
            }
          >
            <option value="">Tous</option>
            {FILTERABLE_CONTRACTS.map((contract) => (
              <option key={contract} value={contract}>
                {CONTRACT_LABELS[contract]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/** Ce que dit une liste vide, selon la vue : jamais une page blanche. */
const EMPTY_MESSAGES: Record<OfferView, string> = {
  active: 'Aucune offre à regarder pour l’instant.',
  saved: 'Aucune offre gardée.',
  dismissed: 'Aucune offre écartée.',
  applied: 'Aucune offre postulée depuis cet écran.',
};

/**
 * Écran Offres : ce que la veille a repéré, le plus pertinent d'abord. Chaque offre se garde, s'écarte, ou devient
 * une candidature d'un geste (« J'ai postulé ») ; son texte ne se lit qu'à la demande.
 * @req EF-VEI-16, EF-VEI-17, EF-VEI-18, EF-VEI-19, EF-VEI-20, EF-VEI-22
 */
export function OffersPage() {
  const [query, setQuery] = useState<OfferQuery>({ view: 'active' });
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const load = useCallback((current: OfferQuery, signal?: AbortSignal) => {
    const offset = current.offset ?? 0;
    return fetchOffers(current, signal)
      .then((page) => {
        setOffers((kept) => (offset === 0 || kept === null ? page.items : [...kept, ...page.items]));
        setTotal(page.total);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (!isAbortError(failure)) setError(messageOf(failure));
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(query, controller.signal);
    return () => controller.abort();
  }, [load, query]);

  // A new filter shows the loading state rather than the offers of the previous one.
  const handleQueryChange = (next: OfferQuery) => {
    setOffers(null);
    setQuery(next);
  };

  const handleMore = async () => {
    const next = { ...query, offset: (offers ?? []).length };
    setIsLoadingMore(true);
    await load(next);
    setIsLoadingMore(false);
  };

  /** Une offre qui change d'état quitte la vue qui ne la montre plus, sans recharger la liste. */
  const handleChanged = (changed: Offer) => {
    const stillShown =
      query.view === 'active'
        ? changed.status === 'new' || changed.status === 'saved'
        : changed.status === query.view;
    setOffers((kept) =>
      (kept ?? []).flatMap((offer) => (offer.id !== changed.id ? [offer] : stillShown ? [changed] : [])),
    );
    if (!stillShown) setTotal((count) => count - 1);
  };

  return (
    <>
      <PageHeader title="Offres" eyebrow="Veille des offres">
        <p>Les offres repérées sur vos sources, les plus proches de ce que vous recherchez en premier.</p>
      </PageHeader>

      <OffersFilters query={query} onChange={handleQueryChange} />

      {error !== null && <Flash>{error}</Flash>}

      {offers === null && error === null && (
        <div role="status" className="offers-loading">
          <span className="visually-hidden">Chargement des offres…</span>
          <Skeleton width="70%" height="1.2rem" />
          <Skeleton width="50%" height="1rem" />
        </div>
      )}

      {offers !== null && offers.length === 0 && (
        <div className="offers-empty" role="note">
          <p>{EMPTY_MESSAGES[query.view]}</p>
          {query.view === 'active' && (
            <p>
              Les offres arrivent des <Link to="/sites">sites surveillés</Link>, consultés à 7 h, 13 h et 19
              h.
            </p>
          )}
        </div>
      )}

      {offers !== null && offers.length > 0 && (
        <>
          <p className="offers-count" role="status">
            {total} offre{total > 1 ? 's' : ''}
          </p>
          <ul className="offers-list" aria-label="Offres">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} onChanged={handleChanged} />
            ))}
          </ul>
          {offers.length < total && (
            <button
              type="button"
              className="btn btn--quiet offers-more"
              disabled={isLoadingMore}
              aria-busy={isLoadingMore}
              onClick={() => void handleMore()}
            >
              {isLoadingMore
                ? 'Chargement…'
                : `Afficher ${String(Math.min(OFFERS_PAGE_SIZE, total - offers.length))} de plus`}
            </button>
          )}
        </>
      )}
    </>
  );
}
