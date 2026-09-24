import { useId } from 'react';
import { FieldShell, useFieldError } from './formFields';
import { readPeriod, writePeriod, type Period } from './period';

/**
 * La période d'une expérience ou d'une formation, choisie dans deux sélecteurs de mois plutôt que saisie à la
 * main. Le profil enregistre toujours du texte (RG-12) : ce composant le relit et le réécrit au format
 * « MM/AAAA – MM/AAAA » attendu par le rendu (RG-15).
 *
 * Une valeur enregistrée qui ne se relit pas en deux mois — « Depuis 2023 » — est conservée et affichée sous les
 * sélecteurs : elle n'est remplacée que lorsque le candidat choisit une date.
 * @req EF-CVX-02, ENF-UTI-02, ENF-UTI-03
 */
export function PeriodField({
  label,
  value,
  onChange,
  path,
}: {
  label: string;
  value: string;
  onChange: (dates: string) => void;
  path: string;
}) {
  const endId = useId();
  const currentId = useId();
  const period = readPeriod(value);
  const error = useFieldError(path);

  const update = (changes: Partial<Period>) => onChange(writePeriod({ ...period, ...changes }));

  return (
    <div className="period-field">
      <FieldShell
        label={`${label} — début`}
        path={path}
        isRequired
        hint={period.original ? `Enregistré : « ${period.original} »` : undefined}
      >
        {({ id, describedBy, isInvalid, isRequired }) => (
          <input
            id={id}
            type="month"
            className="control"
            value={period.start}
            required={isRequired}
            aria-required
            aria-invalid={isInvalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => update({ start: event.target.value, original: null })}
          />
        )}
      </FieldShell>

      <div className="form-field">
        <label className="form-field__label" htmlFor={endId}>
          {label} — fin
        </label>
        <input
          id={endId}
          type="month"
          className="control"
          value={period.end}
          disabled={period.isCurrent}
          aria-invalid={error !== undefined || undefined}
          onChange={(event) => update({ end: event.target.value, original: null })}
        />
      </div>

      <label className="period-field__current" htmlFor={currentId}>
        <input
          id={currentId}
          type="checkbox"
          checked={period.isCurrent}
          onChange={(event) => update({ isCurrent: event.target.checked, end: '', original: null })}
        />{' '}
        En cours aujourd’hui
      </label>
    </div>
  );
}
