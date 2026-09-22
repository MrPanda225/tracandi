import { type FormEvent, useEffect, useId, useState } from 'react';
import { createApplication, type NewApplication } from '../../api/applications';
import { ApiError, type FieldIssue, messageOf } from '../../api/client';
import { Flash } from '../../components/Flash';
import {
  APPLICATION_STATUSES,
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  STATUS_LABELS,
  toApplicationStatus,
  toContractType,
} from '../../lib/format';
import './NewApplicationForm.css';

// Same bounds as the API (CreateApplicationBody in /api/docs).
const COMPANY_MAX_LENGTH = 160;
const JOB_TITLE_MAX_LENGTH = 300;

type TextFieldName = 'companyName' | 'jobTitle';
type FieldErrors = Partial<Record<TextFieldName, string>>;

const EMPTY: NewApplication = { companyName: '', jobTitle: '', status: 'sent', contractType: 'non_precise' };

const localErrorsOf = (values: NewApplication): FieldErrors => ({
  ...(values.companyName.trim() ? {} : { companyName: 'Indiquez le nom de l’entreprise.' }),
  ...(values.jobTitle.trim() ? {} : { jobTitle: 'Indiquez l’intitulé du poste.' }),
});

const apiErrorsOf = (details: readonly FieldIssue[]): FieldErrors =>
  Object.fromEntries(
    details
      .filter((issue) => issue.path === 'companyName' || issue.path === 'jobTitle')
      .map((issue) => [issue.path, issue.message]),
  );

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  error: string | undefined;
  onChange: (value: string) => void;
}

function TextField({ id, label, value, maxLength, error, onChange }: TextFieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="control"
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className="form-field__error">
          {error}
        </p>
      )}
    </div>
  );
}

interface NewApplicationFormProps {
  id: string;
  /** Called once the API has created the application, with the values sent. */
  onCreated: (application: NewApplication) => void;
  onCancel: () => void;
}

/** EF-CAN-06: company, job title, status (Envoyée by default) and contract type (EF-CAN-13). */
export function NewApplicationForm({ id, onCreated, onCancel }: NewApplicationFormProps) {
  const companyId = useId();
  const ids = { jobTitle: useId(), status: useId(), contract: useId() };
  const [values, setValues] = useState<NewApplication>(EMPTY);

  // Opened on demand: the keyboard user lands in the first field instead of staying on the button.
  useEffect(() => {
    document.getElementById(companyId)?.focus();
  }, [companyId]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (changes: Partial<NewApplication>) => setValues((current) => ({ ...current, ...changes }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const localErrors = localErrorsOf(values);
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    const application = { ...values, companyName: values.companyName.trim(), jobTitle: values.jobTitle.trim() };
    setIsSubmitting(true);
    setError(null);
    try {
      await createApplication(application);
      onCreated(application);
    } catch (failure) {
      setError(messageOf(failure));
      if (failure instanceof ApiError) setFieldErrors(apiErrorsOf(failure.details));
      setIsSubmitting(false);
    }
  };

  return (
    <form
      id={id}
      className="new-application"
      aria-label="Nouvelle candidature"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {error && <Flash>{error}</Flash>}
      <div className="new-application__fields">
        <TextField
          id={companyId}
          label="Entreprise"
          value={values.companyName}
          maxLength={COMPANY_MAX_LENGTH}
          error={fieldErrors.companyName}
          onChange={(companyName) => update({ companyName })}
        />
        <TextField
          id={ids.jobTitle}
          label="Intitulé du poste"
          value={values.jobTitle}
          maxLength={JOB_TITLE_MAX_LENGTH}
          error={fieldErrors.jobTitle}
          onChange={(jobTitle) => update({ jobTitle })}
        />
        <div className="form-field">
          <label className="form-field__label" htmlFor={ids.status}>
            Statut
          </label>
          <select
            id={ids.status}
            className="control"
            value={values.status}
            onChange={(event) => {
              const status = toApplicationStatus(event.target.value);
              if (status) update({ status });
            }}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor={ids.contract}>
            Type de contrat
          </label>
          <select
            id={ids.contract}
            className="control"
            value={values.contractType}
            onChange={(event) => {
              const contractType = toContractType(event.target.value);
              if (contractType) update({ contractType });
            }}
          >
            {CONTRACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTRACT_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="new-application__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
