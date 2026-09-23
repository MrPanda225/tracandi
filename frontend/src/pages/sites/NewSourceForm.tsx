import { useId, useState } from 'react';
import { ApiError, messageOf } from '../../api/client';
import type { NewSource, SourceAdapterId, SourceType } from '../../api/sites';

/** ENF-SEC-04 : ce que l'API a refusé, par chemin de champ, pour l'afficher sous le champ concerné. */
type Refusals = Readonly<Record<string, string>>;

const refusalsOf = (failure: unknown): Refusals =>
  failure instanceof ApiError
    ? Object.fromEntries(failure.details.map((issue) => [issue.path, issue.message]))
    : {};

const emptyDraft = (types: readonly SourceType[]): NewSource => ({
  companyName: '',
  adapter: types[0]?.id ?? 'greenhouse',
  identifier: '',
});

/**
 * EF-VEI-01 : ajout d'une source surveillée. Le type est choisi dans la liste que l'API décrit (ENF-MAI-03), et
 * l'aide de saisie est celle du type choisi — un slug pour un job board, une adresse pour une page carrières
 * (RG-08). Un refus de l'API s'affiche sous le champ qu'il nomme (ENF-SEC-04).
 * @req EF-VEI-01, EF-VEI-02, EF-VEI-03
 */
export function NewSourceForm({
  types,
  onAdd,
}: {
  types: readonly SourceType[];
  onAdd: (source: NewSource) => Promise<void>;
}) {
  const companyId = useId();
  const adapterId = useId();
  const identifierId = useId();
  const [draft, setDraft] = useState<NewSource>(() => emptyDraft(types));
  const [refusals, setRefusals] = useState<Refusals>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // La liste arrive après le premier rendu : le premier type devient le choix par défaut.
  const adapter = types.some((type) => type.id === draft.adapter) ? draft.adapter : (types[0]?.id ?? draft.adapter);
  const chosen = types.find((type) => type.id === adapter);

  const handleSubmit = async () => {
    setIsSaving(true);
    setFailure(null);
    setRefusals({});
    try {
      await onAdd({ ...draft, adapter });
      setDraft(emptyDraft(types));
    } catch (error) {
      setFailure(messageOf(error));
      setRefusals(refusalsOf(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      className="new-source"
      aria-label="Ajouter une source"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div className="form-field">
        <div className="form-field__heading">
          <label className="form-field__label" htmlFor={companyId}>
            Entreprise
          </label>
          <span className="form-field__required" aria-hidden="true">
            *
          </span>
        </div>
        <input
          id={companyId}
          className="control"
          required
          aria-required
          aria-invalid={refusals['body.companyName'] !== undefined || undefined}
          aria-describedby={refusals['body.companyName'] ? `${companyId}-error` : undefined}
          value={draft.companyName}
          onChange={(event) => setDraft({ ...draft, companyName: event.target.value })}
        />
        {refusals['body.companyName'] && (
          <p id={`${companyId}-error`} className="form-field__error">
            {refusals['body.companyName']}
          </p>
        )}
      </div>

      <div className="form-field">
        <label className="form-field__label" htmlFor={adapterId}>
          Type de source
        </label>
        <select
          id={adapterId}
          className="control"
          value={adapter}
          onChange={(event) => setDraft({ ...draft, adapter: event.target.value as SourceAdapterId })}
        >
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field new-source__identifier">
        <div className="form-field__heading">
          <label className="form-field__label" htmlFor={identifierId}>
            Identifiant
          </label>
          <span className="form-field__required" aria-hidden="true">
            *
          </span>
        </div>
        <input
          id={identifierId}
          className="control"
          required
          aria-required
          aria-invalid={refusals['body.identifier'] !== undefined || undefined}
          aria-describedby={`${identifierId}-hint${refusals['body.identifier'] ? ` ${identifierId}-error` : ''}`}
          value={draft.identifier}
          onChange={(event) => setDraft({ ...draft, identifier: event.target.value })}
        />
        <p id={`${identifierId}-hint`} className="form-field__hint">
          {chosen?.identifierHint ?? ''}
        </p>
        {refusals['body.identifier'] && (
          <p id={`${identifierId}-error`} className="form-field__error">
            {refusals['body.identifier']}
          </p>
        )}
      </div>

      <div className="new-source__actions">
        <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Ajout…' : 'Surveiller cette source'}
        </button>
      </div>

      {/* Un refus qu'aucun champ ne nomme — une source déjà surveillée (409) — reste lisible ici. */}
      {failure !== null && Object.keys(refusals).length === 0 && (
        <p className="new-source__failure" role="alert">
          {failure}
        </p>
      )}
    </form>
  );
}
