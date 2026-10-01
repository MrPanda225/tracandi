import { useCallback, useEffect, useState } from 'react';
import { isAbortError, messageOf } from '../../api/client';
import { followRuns, isRunning, type RunState } from '../../api/jobs';
import {
  addSource,
  discoverSources,
  fetchSources,
  fetchSourceTypes,
  fetchSuggestions,
  removeSource,
  runWatch,
  setSourceActive,
  type NewSource,
  type Source,
  type SourceAdapterId,
  type SourceSuggestion,
  type SourceType,
} from '../../api/sites';
import { Flash } from '../../components/Flash';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { formatDateTime } from '../../lib/format';
import { CriteriaCard } from './CriteriaCard';
import { NewSourceForm } from './NewSourceForm';
import { OfficialSources } from './OfficialSources';
import { Suggestions, type WatchAllFailure } from './Suggestions';
import './SitesPage.css';

/** EF-VEI-07 : ce qu'une passe a produit, lu dans les compteurs de son exécution (EF-EXE-03). */
const reportOf = (run: RunState): string => {
  const counters = run.counters;
  const sources = counters['sources_checked'] ?? 0;
  const found = counters['offers_new'] ?? 0;
  const relevant = counters['offers_relevant'] ?? 0;
  return (
    `${String(sources)} source${sources > 1 ? 's' : ''} consultée${sources > 1 ? 's' : ''}, ` +
    `${String(found)} nouvelle${found > 1 ? 's' : ''} offre${found > 1 ? 's' : ''}, ` +
    `dont ${String(relevant)} au-dessus de votre seuil.`
  );
};

/** EF-VEI-10, EF-VEI-11 : ce que la dernière consultation d'une source a laissé. */
function LastCheck({ source }: { source: Source }) {
  if (source.lastError !== null) {
    return (
      <p className="site__error" role="note">
        Dernière consultation en échec : {source.lastError}
      </p>
    );
  }
  return (
    <p className="site__meta">
      {source.lastCheckedAt === null
        ? 'Jamais consultée'
        : `Consultée le ${formatDateTime(source.lastCheckedAt)}`}{' '}
      · {source.offerCount} offre{source.offerCount > 1 ? 's' : ''} repérée
      {source.offerCount > 1 ? 's' : ''}
    </p>
  );
}

function SourceRow({
  source,
  isBusy,
  onToggle,
  onRemove,
}: {
  source: Source;
  isBusy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);

  return (
    <li className={`site${source.isActive ? '' : ' site--suspended'}`}>
      <div className="site__main">
        <p className="site__company">
          {source.companyName ?? source.adapterLabel}
          {!source.isActive && <span className="site__badge">Suspendue</span>}
        </p>
        <p className="site__meta">
          {source.companyName === null ? (
            'Interrogée selon vos critères de recherche'
          ) : (
            <>
              {source.adapterLabel} · <code>{source.identifier}</code>
            </>
          )}
        </p>
        <LastCheck source={source} />
      </div>

      <div className="site__actions">
        <button type="button" className="btn btn--quiet btn--small" disabled={isBusy} onClick={onToggle}>
          {source.isActive ? 'Suspendre' : 'Réactiver'}
        </button>
        {isConfirming ? (
          <>
            <button type="button" className="btn btn--small" disabled={isBusy} onClick={onRemove}>
              Confirmer le retrait
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--small"
              onClick={() => setIsConfirming(false)}
            >
              Annuler
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            disabled={isBusy}
            onClick={() => setIsConfirming(true)}
          >
            Retirer
          </button>
        )}
      </div>
      {isConfirming && (
        <p className="site__confirm" role="note">
          Les {source.offerCount} offre{source.offerCount > 1 ? 's' : ''} repérée
          {source.offerCount > 1 ? 's' : ''} sur cette source seront supprimées avec elle.
        </p>
      )}
    </li>
  );
}

/**
 * Écran Sites surveillés : les sources que le candidat suit, et la consultation qu'il déclenche lui-même.
 * Une passe est mise en file d'attente et suivie en direct (EF-EXE-01, EF-EXE-04) : le bouton ne bloque rien.
 * @req EF-VEI-01 à EF-VEI-05, EF-VEI-07, EF-VEI-10, EF-VEI-11
 */
export function SitesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [types, setTypes] = useState<SourceType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [suggestions, setSuggestions] = useState<SourceSuggestion[]>([]);
  const [prefill, setPrefill] = useState<NewSource | null>(null);
  const [discovery, setDiscovery] = useState<RunState | null>(null);

  /* Ne lit que les sources : la liste des types ne bouge pas d'une consultation à l'autre, et la recharger à
     chaque fois risquerait de l'effacer avec une valeur capturée trop tôt. */
  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([fetchSources(signal), fetchSuggestions(signal)])
        .then(([items, proposed]) => {
          setSources(items);
          setSuggestions(proposed);
          setError(null);
        })
        .catch((failure: unknown) => {
          if (!isAbortError(failure)) setError(messageOf(failure));
        }),
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    fetchSourceTypes(controller.signal)
      .then(setTypes)
      .catch((failure: unknown) => {
        if (!isAbortError(failure)) setError(messageOf(failure));
      });
    return () => controller.abort();
  }, [load]);

  // EF-EXE-04 : l'avancement arrive tout seul ; une passe lancée par le planificateur s'affiche aussi.
  useEffect(
    () =>
      followRuns((state) => {
        if (state.job === 'source_discovery') {
          setDiscovery(state);
          if (!isRunning(state)) void load();
          return;
        }
        if (state.job !== 'scraper') return;
        setRun(state);
        if (!isRunning(state)) void load();
      }),
    [load],
  );

  const act = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async (source: NewSource) => {
    await addSource(source);
    const name = source.companyName ?? types.find((type) => type.id === source.adapter)?.label ?? 'La source';
    setNotice(`${name} est maintenant surveillée.`);
    await load();
  };

  /**
   * EF-VEI-26 : ajoute les propositions l'une après l'autre, et rend celles qui ont été refusées. Séquentiel à
   * dessein : chaque ajout crée une entreprise si besoin, et le lot reste court.
   */
  const handleWatchAll = async (proposed: readonly SourceSuggestion[]): Promise<WatchAllFailure[]> => {
    const failures: WatchAllFailure[] = [];
    let added = 0;
    for (const suggestion of proposed) {
      try {
        await addSource({
          companyName: suggestion.companyName,
          adapter: suggestion.adapter,
          identifier: suggestion.identifier,
        });
        added += 1;
      } catch (failure) {
        failures.push({ companyName: suggestion.companyName, reason: messageOf(failure) });
      }
    }
    setNotice(
      added === 0 ? null : `${String(added)} source${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}.`,
    );
    await load();
    return failures;
  };

  // EF-VEI-38 : la recherche est mise en file ; son avancement arrive par le flux des exécutions.
  const handleDiscover = async () => {
    setError(null);
    try {
      await discoverSources();
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const labelOf = (adapter: SourceAdapterId): string =>
    types.find((type) => type.id === adapter)?.label ?? adapter;

  const handleRun = async () => {
    setError(null);
    setNotice(null);
    try {
      await runWatch();
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const activeCount = (sources ?? []).filter((source) => source.isActive).length;

  return (
    <>
      <PageHeader title="Sites surveillés" eyebrow="Veille des offres">
        <p>
          Les entreprises dont Tracandi lit le site carrières. Chaque source active est consultée à 7 h, 13 h
          et 19 h ; les offres repérées sont notées selon ce que vous recherchez.
        </p>
      </PageHeader>

      {error !== null && <Flash>{error}</Flash>}
      {notice !== null && <Flash tone="success">{notice}</Flash>}

      <CriteriaCard />

      <div className="sites-actions">
        <button
          type="button"
          className="btn"
          disabled={isRunning(run) || activeCount === 0}
          aria-busy={isRunning(run)}
          onClick={() => void handleRun()}
        >
          {isRunning(run) ? 'Consultation en cours…' : 'Consulter maintenant'}
        </button>
        {run !== null && (
          <p className="sites-actions__report" role="status">
            {isRunning(run)
              ? 'Les sources sont lues l’une après l’autre ; les offres nouvelles sont notées.'
              : run.outcome === 'failure'
                ? `Consultation en échec : ${run.error ?? 'raison inconnue'}`
                : reportOf(run)}
          </p>
        )}
      </div>

      <Suggestions
        suggestions={suggestions}
        onWatchAll={handleWatchAll}
        onWatch={(suggestion) =>
          setPrefill({
            companyName: suggestion.companyName,
            adapter: suggestion.adapter,
            identifier: suggestion.identifier,
          })
        }
        onDismissed={() => void load()}
        discovery={discovery}
        onDiscover={() => void handleDiscover()}
        labelOf={labelOf}
      />

      <OfficialSources types={types} sources={sources ?? []} onAdd={handleAdd} />

      <NewSourceForm types={types.filter((type) => !type.isOfficial)} prefill={prefill} onAdd={handleAdd} />

      {sources === null && error === null && (
        <div role="status" aria-live="polite" className="sites-loading">
          <span className="visually-hidden">Chargement des sources surveillées…</span>
          <Skeleton width="60%" height="1.2rem" />
          <Skeleton width="45%" height="1rem" />
        </div>
      )}

      {sources !== null && sources.length === 0 && (
        <p className="sites-empty" role="note">
          Aucune source surveillée pour l’instant. Ajoutez l’entreprise dont vous voulez suivre les offres.
        </p>
      )}

      {sources !== null && sources.length > 0 && (
        <ul className="sites-list" aria-label="Sources surveillées">
          {sources.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              isBusy={busyId === source.id}
              onToggle={() => void act(source.id, () => setSourceActive(source.id, !source.isActive))}
              onRemove={() => void act(source.id, () => removeSource(source.id))}
            />
          ))}
        </ul>
      )}
    </>
  );
}
