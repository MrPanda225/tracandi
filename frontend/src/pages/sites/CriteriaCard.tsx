import { useEffect, useId, useState } from 'react';
import { ApiError, isAbortError, messageOf } from '../../api/client';
import {
  CRITERIA_CONTRACT_TYPES,
  fetchCriteria,
  findPlaces,
  saveCriteria,
  type CriteriaContractType,
  type Place,
  type WatchCriteria,
} from '../../api/criteria';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import { CONTRACT_LABELS } from '../../lib/format';

const MAX_TARGETS = 5;
const RADII_KM = [5, 10, 20, 30, 50, 100] as const;
const DEFAULT_RADIUS_KM = 30;

/** Une cible en cours de saisie : les mots-clés restent le texte tapé jusqu'à l'enregistrement. */
interface TargetDraft {
  /** Identifie la cible dans la liste le temps de la saisie ; jamais envoyé. */
  key: number;
  label: string;
  keywords: string;
  contractTypes: CriteriaContractType[];
}

interface Draft {
  targets: TargetDraft[];
  place: Place | null;
  radiusKm: number;
  acceptsRemote: boolean;
  romeCodes: string;
}

let lastKey = 0;
const nextKey = (): number => {
  lastKey += 1;
  return lastKey;
};

const emptyTarget = (): TargetDraft => ({ key: nextKey(), label: '', keywords: '', contractTypes: ['cdi'] });

const listOf = (text: string): string[] =>
  text
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');

const draftOf = (criteria: WatchCriteria | null): Draft =>
  criteria === null
    ? {
        targets: [emptyTarget()],
        place: null,
        radiusKm: DEFAULT_RADIUS_KM,
        acceptsRemote: true,
        romeCodes: '',
      }
    : {
        targets: criteria.targets.map((target) => ({
          key: nextKey(),
          label: target.label,
          keywords: target.keywords.join(', '),
          contractTypes: target.contractTypes,
        })),
        place: criteria.place,
        radiusKm: criteria.radiusKm,
        acceptsRemote: criteria.acceptsRemote,
        romeCodes: criteria.romeCodes.join(', '),
      };

const criteriaOf = (draft: Draft): WatchCriteria => ({
  targets: draft.targets.map((target) => ({
    label: target.label.trim(),
    keywords: listOf(target.keywords),
    contractTypes: target.contractTypes,
  })),
  place: draft.place,
  radiusKm: draft.radiusKm,
  acceptsRemote: draft.acceptsRemote,
  romeCodes: listOf(draft.romeCodes),
});

/** Où chercher, en une ligne : la commune et son rayon, ou toute la France. */
const whereOf = (criteria: WatchCriteria): string => {
  const where = criteria.place
    ? `${criteria.place.name} (${criteria.place.departmentCode}) et ${String(criteria.radiusKm)} km autour`
    : 'Toute la France';
  return criteria.acceptsRemote ? `${where}, télétravail accepté` : where;
};

/** EF-VEI-29 : ce qui est enregistré, en quelques lignes, avant tout formulaire. */
function CriteriaSummary({ criteria, onEdit }: { criteria: WatchCriteria; onEdit: () => void }) {
  return (
    <div className="criteria__summary">
      <ul className="criteria__targets" aria-label="Vos cibles">
        {criteria.targets.map((target) => (
          <li key={target.label}>
            <strong>{target.label}</strong>{' '}
            <span className="criteria__contracts">
              {target.contractTypes.map((contract) => CONTRACT_LABELS[contract]).join(', ')}
            </span>
          </li>
        ))}
      </ul>
      <p className="criteria__where">{whereOf(criteria)}</p>
      <button type="button" className="btn btn--quiet btn--small" onClick={onEdit}>
        Modifier
      </button>
    </div>
  );
}

/** EF-VEI-30 : la commune se choisit parmi celles que le service public connaît, jamais tapée librement. */
function PlacePicker({ place, onChange }: { place: Place | null; onChange: (place: Place | null) => void }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const search = async () => {
    setIsSearching(true);
    setFailure(null);
    try {
      setFound(await findPlaces(query));
    } catch (error) {
      setFailure(messageOf(error));
    } finally {
      setIsSearching(false);
    }
  };

  if (place !== null) {
    return (
      <div className="criteria__place">
        <p className="criteria__chosen">
          {place.name} ({place.departmentCode})
        </p>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => onChange(null)}>
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={inputId}>
        Commune
      </label>
      <div className="criteria__search">
        <input
          id={inputId}
          className="control"
          value={query}
          aria-describedby={`${inputId}-hint`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void search();
            }
          }}
        />
        <button
          type="button"
          className="btn btn--quiet btn--small"
          disabled={query.trim().length < 2 || isSearching}
          aria-busy={isSearching}
          onClick={() => void search()}
        >
          Rechercher
        </button>
      </div>
      <p id={`${inputId}-hint`} className="form-field__hint">
        Sans commune, les offres de toute la France sont lues.
      </p>
      {failure !== null && <p className="form-field__error">{failure}</p>}
      {found !== null &&
        (found.length === 0 ? (
          <p className="form-field__hint" role="status">
            Aucune commune de ce nom.
          </p>
        ) : (
          <ul className="criteria__places" aria-label="Communes trouvées">
            {found.map((candidate) => (
              <li key={candidate.code}>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  onClick={() => onChange(candidate)}
                >
                  {candidate.name} ({candidate.departmentCode})
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function TargetFields({
  index,
  target,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  target: TargetDraft;
  canRemove: boolean;
  onChange: (target: TargetDraft) => void;
  onRemove: () => void;
}) {
  const labelId = useId();
  const keywordsId = useId();

  const toggle = (contract: CriteriaContractType) =>
    onChange({
      ...target,
      contractTypes: target.contractTypes.includes(contract)
        ? target.contractTypes.filter((kept) => kept !== contract)
        : [...target.contractTypes, contract],
    });

  return (
    <fieldset className="criteria__target">
      <legend>Cible {index + 1}</legend>
      <div className="form-field">
        <label className="form-field__label" htmlFor={labelId}>
          Métier
        </label>
        <input
          id={labelId}
          className="control"
          required
          aria-required
          value={target.label}
          onChange={(event) => onChange({ ...target, label: event.target.value })}
        />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor={keywordsId}>
          Mots-clés
        </label>
        <input
          id={keywordsId}
          className="control"
          required
          aria-required
          aria-describedby={`${keywordsId}-hint`}
          value={target.keywords}
          onChange={(event) => onChange({ ...target, keywords: event.target.value })}
        />
        <p id={`${keywordsId}-hint`} className="form-field__hint">
          Séparés par des virgules : une offre qui n’en contient aucun n’est pas notée.
        </p>
      </div>
      <div
        className="criteria__contract-choices"
        role="group"
        aria-label={`Contrats de la cible ${String(index + 1)}`}
      >
        {CRITERIA_CONTRACT_TYPES.map((contract) => (
          <label key={contract} className="criteria__choice">
            <input
              type="checkbox"
              checked={target.contractTypes.includes(contract)}
              onChange={() => toggle(contract)}
            />
            {CONTRACT_LABELS[contract]}
          </label>
        ))}
      </div>
      {canRemove && (
        <button type="button" className="btn btn--quiet btn--small" onClick={onRemove}>
          Retirer cette cible
        </button>
      )}
    </fieldset>
  );
}

/**
 * EF-VEI-29 à EF-VEI-31 : les critères de recherche, qui servent aux sources officielles et à la note de chaque
 * offre. Enregistrés, ils se résument en quelques lignes ; le formulaire ne s'ouvre qu'à la demande.
 * @req EF-VEI-29, EF-VEI-30, EF-VEI-31
 */
export function CriteriaCard() {
  const radiusId = useId();
  const romeId = useId();
  const [saved, setSaved] = useState<WatchCriteria | null | undefined>(undefined);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [failure, setFailure] = useState<{ message: string; details: string[] } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchCriteria(controller.signal)
      .then((criteria) => {
        setSaved(criteria);
        if (criteria === null) setDraft(draftOf(null));
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setFailure({ message: messageOf(error), details: [] });
      });
    return () => controller.abort();
  }, []);

  const handleSave = async (current: Draft) => {
    setIsSaving(true);
    setFailure(null);
    try {
      setSaved(await saveCriteria(criteriaOf(current)));
      setDraft(null);
    } catch (error) {
      setFailure({
        message: messageOf(error),
        details: error instanceof ApiError ? error.details.map((issue) => issue.message) : [],
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateTarget = (current: Draft, index: number, target: TargetDraft) =>
    setDraft({ ...current, targets: current.targets.map((kept, at) => (at === index ? target : kept)) });

  return (
    <section className="criteria" aria-labelledby="criteria-title">
      <h2 id="criteria-title" className="criteria__title">
        Ce que vous recherchez
      </h2>

      {saved === undefined && failure === null && (
        <div role="status" className="criteria__loading">
          <span className="visually-hidden">Chargement de vos critères…</span>
          <Skeleton width="50%" height="1rem" />
        </div>
      )}

      {saved !== undefined && saved !== null && draft === null && (
        <CriteriaSummary criteria={saved} onEdit={() => setDraft(draftOf(saved))} />
      )}

      {draft !== null && (
        <form
          className="criteria__form"
          aria-label="Critères de recherche"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave(draft);
          }}
        >
          {draft.targets.map((target, index) => (
            <TargetFields
              key={target.key}
              index={index}
              target={target}
              canRemove={draft.targets.length > 1}
              onChange={(changed) => updateTarget(draft, index, changed)}
              onRemove={() => setDraft({ ...draft, targets: draft.targets.filter((_, at) => at !== index) })}
            />
          ))}
          {draft.targets.length < MAX_TARGETS && (
            <button
              type="button"
              className="btn btn--quiet btn--small criteria__add"
              onClick={() => setDraft({ ...draft, targets: [...draft.targets, emptyTarget()] })}
            >
              Ajouter une cible
            </button>
          )}

          <PlacePicker place={draft.place} onChange={(place) => setDraft({ ...draft, place })} />

          <div className="form-field">
            <label className="form-field__label" htmlFor={radiusId}>
              Rayon autour de la commune
            </label>
            <select
              id={radiusId}
              className="control"
              value={draft.radiusKm}
              onChange={(event) => setDraft({ ...draft, radiusKm: Number(event.target.value) })}
            >
              {RADII_KM.map((radius) => (
                <option key={radius} value={radius}>
                  {radius} km
                </option>
              ))}
            </select>
          </div>

          <label className="criteria__choice">
            <input
              type="checkbox"
              checked={draft.acceptsRemote}
              onChange={(event) => setDraft({ ...draft, acceptsRemote: event.target.checked })}
            />
            Télétravail accepté
          </label>

          <details className="criteria__advanced">
            <summary>Codes ROME (facultatif)</summary>
            <div className="form-field">
              <label className="form-field__label" htmlFor={romeId}>
                Codes ROME
              </label>
              <input
                id={romeId}
                className="control"
                aria-describedby={`${romeId}-hint`}
                value={draft.romeCodes}
                onChange={(event) => setDraft({ ...draft, romeCodes: event.target.value })}
              />
              <p id={`${romeId}-hint`} className="form-field__hint">
                Précisent la recherche France Travail, par exemple M1419 (data analyst), M1811 (data
                engineer).
              </p>
            </div>
          </details>

          {failure !== null && (
            <>
              <Flash>{failure.message}</Flash>
              {failure.details.length > 0 && (
                <ul className="criteria__refusals" aria-label="Champs refusés">
                  {failure.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="criteria__actions">
            <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? 'Enregistrement…' : 'Enregistrer mes critères'}
            </button>
            {saved !== null && saved !== undefined && (
              <button type="button" className="btn btn--quiet" onClick={() => setDraft(null)}>
                Annuler
              </button>
            )}
          </div>
        </form>
      )}

      {draft === null && failure !== null && <Flash>{failure.message}</Flash>}
    </section>
  );
}
