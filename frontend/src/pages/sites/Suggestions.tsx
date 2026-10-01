import { useState } from 'react';
import { messageOf } from '../../api/client';
import { isRunning, type RunState } from '../../api/jobs';
import { dismissSuggestion, type SourceSuggestion } from '../../api/sites';

/** EF-VEI-39 : ce que la recherche a trouvé pour une entreprise, en une ligne. */
const verdictOf = (
  suggestion: SourceSuggestion,
  labelOf: (adapter: SourceSuggestion['adapter']) => string,
) => {
  const label = labelOf(suggestion.adapter);
  switch (suggestion.verification) {
    case 'verified':
      return {
        tone: 'verified',
        text: `${label} trouvé · ${String(suggestion.offerCount ?? 0)} offre${(suggestion.offerCount ?? 0) > 1 ? 's' : ''}`,
      };
    case 'unconfirmed':
      return { tone: 'unconfirmed', text: `${label} trouvé, à confirmer` };
    case 'not_found':
      return { tone: 'not-found', text: 'Aucune page carrières trouvée' };
    default:
      return null;
  }
};

/** EF-VEI-38 : l'avancement de la recherche, lu dans les compteurs de son exécution. */
const discoveryReportOf = (run: RunState): string => {
  const searched = run.counters['companies_searched'] ?? 0;
  const verified = run.counters['sources_verified'] ?? 0;
  if (isRunning(run))
    return `Recherche en cours : ${String(searched)} entreprise${searched > 1 ? 's' : ''} examinée${searched > 1 ? 's' : ''}.`;
  if (run.outcome === 'failure') return `Recherche en échec : ${run.error ?? 'raison inconnue'}`;
  return `${String(searched)} entreprise${searched > 1 ? 's' : ''} examinée${searched > 1 ? 's' : ''}, ${String(verified)} source${verified > 1 ? 's' : ''} vérifiée${verified > 1 ? 's' : ''}.`;
};

/** EF-VEI-26 : une proposition que l'API a refusée, et pourquoi. */
export interface WatchAllFailure {
  companyName: string;
  reason: string;
}

/**
 * EF-VEI-23 à EF-VEI-25 : les entreprises auxquelles le candidat a déjà postulé et qu'il ne surveille pas
 * encore. Rien n'est ajouté d'office : « Surveiller » pré-remplit le formulaire d'ajout, que le candidat
 * vérifie avant d'enregistrer (RG-19).
 * @req EF-VEI-23, EF-VEI-24, EF-VEI-25
 */
export function Suggestions({
  suggestions,
  onWatch,
  onWatchAll,
  onDismissed,
  discovery,
  onDiscover,
  labelOf,
}: {
  suggestions: readonly SourceSuggestion[];
  /** EF-VEI-38 : la dernière recherche des pages carrières, suivie en direct ; null avant la première. */
  discovery: RunState | null;
  onDiscover: () => void;
  /** Le nom d'un type de source, tel que l'API le décrit (ENF-MAI-03). */
  labelOf: (adapter: SourceSuggestion['adapter']) => string;
  onWatch: (suggestion: SourceSuggestion) => void;
  /** EF-VEI-26 : ajoute toutes les propositions et rend compte de celles qui ont été refusées. */
  onWatchAll: (suggestions: readonly SourceSuggestion[]) => Promise<readonly WatchAllFailure[]>;
  onDismissed: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isAddingAll, setIsAddingAll] = useState(false);
  const [refused, setRefused] = useState<readonly WatchAllFailure[]>([]);

  if (suggestions.length === 0) return null;

  const handleWatchAll = async () => {
    setIsAddingAll(true);
    setFailure(null);
    setRefused([]);
    try {
      setRefused(await onWatchAll(suggestions));
    } finally {
      setIsAddingAll(false);
    }
  };

  const handleDismiss = async (companyId: number) => {
    setBusyId(companyId);
    setFailure(null);
    try {
      await dismissSuggestion(companyId);
      onDismissed();
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="suggestions" aria-labelledby="suggestions-titre">
      <h2 id="suggestions-titre" className="suggestions__title">
        Entreprises auxquelles vous avez postulé
      </h2>
      <p className="suggestions__lede">
        Déduites de vos candidatures et du domaine d’où ces entreprises vous ont écrit. Vérifiez l’identifiant
        avant d’enregistrer : rien n’est ajouté sans vous.
      </p>

      <div className="suggestions__discover">
        <button
          type="button"
          className="btn btn--quiet btn--small"
          disabled={isRunning(discovery)}
          aria-busy={isRunning(discovery)}
          onClick={onDiscover}
        >
          {isRunning(discovery) ? 'Recherche en cours…' : 'Rechercher leurs pages carrières'}
        </button>
        <span className="suggestions__bulk-hint" aria-live="polite">
          {discovery === null
            ? 'Tracandi lit le site de chaque entreprise, reconnaît son logiciel de recrutement et le vérifie.'
            : discoveryReportOf(discovery)}
        </span>
      </div>

      <div className="suggestions__bulk">
        <button
          type="button"
          className="btn btn--small"
          disabled={isAddingAll}
          aria-busy={isAddingAll}
          onClick={() => void handleWatchAll()}
        >
          {isAddingAll ? 'Ajout…' : `Surveiller les ${String(suggestions.length)}`}
        </button>
        <span className="suggestions__bulk-hint">
          L’identifiant d’un job board est déduit du nom de l’entreprise : une source ajoutée ainsi peut
          échouer à sa première consultation, et se corrige depuis la liste.
        </span>
      </div>

      {failure !== null && (
        <p className="suggestions__failure" role="alert">
          {failure}
        </p>
      )}

      {refused.length > 0 && (
        <div className="suggestions__refused" role="status">
          <p>Ces entreprises n’ont pas pu être ajoutées :</p>
          <ul>
            {refused.map((entry) => (
              <li key={entry.companyName}>
                <strong>{entry.companyName}</strong> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="suggestions__list" aria-label="Sources proposées">
        {suggestions.map((suggestion) => (
          <li className="suggestion" key={suggestion.companyId}>
            <div className="suggestion__main">
              <p className="suggestion__company">{suggestion.companyName}</p>
              <p className="suggestion__meta">
                {suggestion.domain} · {suggestion.messages} message
                {suggestion.messages > 1 ? 's' : ''} reçu{suggestion.messages > 1 ? 's' : ''}
              </p>
              {(() => {
                const verdict = verdictOf(suggestion, labelOf);
                return verdict === null ? null : (
                  <p className={`suggestion__verdict suggestion__verdict--${verdict.tone}`}>{verdict.text}</p>
                );
              })()}
            </div>
            <div className="suggestion__actions">
              <button
                type="button"
                className="btn btn--small"
                disabled={busyId === suggestion.companyId}
                onClick={() => onWatch(suggestion)}
              >
                Surveiller
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--small"
                disabled={busyId === suggestion.companyId}
                onClick={() => void handleDismiss(suggestion.companyId)}
              >
                Écarter
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
