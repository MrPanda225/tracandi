import { type FormEvent, useEffect, useId, useState } from 'react';
import { createApplication, type NewApplication, OFFER_DESCRIPTION_MAX_LENGTH } from '../../api/applications';
import { ApiError, messageOf } from '../../api/client';
import type { ApplicationStatus, ContractType } from '../../api/stats';
import { Flash } from '../../components/Flash';
import {
  appliedAtFromInput,
  appliedDateProblem,
  EARLIEST_DATE_INPUT,
  toDateInputValue,
} from '../../lib/dates';
import { fieldErrorsFrom } from '../../lib/fieldErrors';
import {
  APPLICATION_STATUSES,
  CONTRACT_LABELS,
  CONTRACT_TYPES,
  STATUS_LABELS,
  toApplicationStatus,
  toContractType,
} from '../../lib/format';
import { DateField, TextAreaField, TextField } from './fields';
import './NewApplicationForm.css';

// Same bounds as the API (CreateApplicationBody in /api/docs).
const COMPANY_MAX_LENGTH = 160;
const JOB_TITLE_MAX_LENGTH = 300;

type FieldName = 'companyName' | 'jobTitle' | 'appliedOn' | 'offerDescription';
type FieldErrors = Partial<Record<FieldName, string>>;

const API_FIELDS: Readonly<Record<string, FieldName>> = {
  'body.companyName': 'companyName',
  'body.jobTitle': 'jobTitle',
  'body.appliedAt': 'appliedOn',
  'body.offerDescription': 'offerDescription',
};

interface FormValues {
  companyName: string;
  jobTitle: string;
  status: ApplicationStatus;
  contractType: ContractType;
  /** `YYYY-MM-DD`, today by default (EF-CAN-16). */
  appliedOn: string;
  offerDescription: string;
}

const initialValues = (now: Date): FormValues => ({
  companyName: '',
  jobTitle: '',
  status: 'sent',
  contractType: 'non_precise',
  appliedOn: toDateInputValue(now),
  offerDescription: '',
});

const localErrorsOf = (values: FormValues, now: Date): FieldErrors => {
  const dateProblem = appliedDateProblem(values.appliedOn, now);
  return {
    ...(values.companyName.trim() ? {} : { companyName: 'Indiquez le nom de l’entreprise.' }),
    ...(values.jobTitle.trim() ? {} : { jobTitle: 'Indiquez l’intitulé du poste.' }),
    ...(dateProblem ? { appliedOn: dateProblem } : {}),
  };
};

/** Today is left to the API (dated at reception); a past day is sent explicitly. */
const toNewApplication = (values: FormValues, now: Date): NewApplication => {
  const offerDescription = values.offerDescription.trim();
  return {
    companyName: values.companyName.trim(),
    jobTitle: values.jobTitle.trim(),
    status: values.status,
    contractType: values.contractType,
    ...(values.appliedOn === toDateInputValue(now)
      ? {}
      : { appliedAt: appliedAtFromInput(values.appliedOn, now) }),
    ...(offerDescription ? { offerDescription } : {}),
  };
};

interface NewApplicationFormProps {
  id: string;
  /** Called once the API has created the application, with the values sent. */
  onCreated: (application: NewApplication) => void;
  onCancel: () => void;
}

/**
 * EF-CAN-06: company, job title, status (Envoyée by default), contract type (EF-CAN-13), application date (today by
 * default, EF-CAN-16) and description of the offer (EF-CAN-15).
 */
export function NewApplicationForm({ id, onCreated, onCancel }: NewApplicationFormProps) {
  const companyId = useId();
  const ids = { jobTitle: useId(), status: useId(), contract: useId(), date: useId(), description: useId() };
  const [values, setValues] = useState<FormValues>(() => initialValues(new Date()));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = toDateInputValue(new Date());

  // Opened on demand: the keyboard user lands in the first field instead of staying on the button.
  useEffect(() => {
    document.getElementById(companyId)?.focus();
  }, [companyId]);

  const update = (changes: Partial<FormValues>) => setValues((current) => ({ ...current, ...changes }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const now = new Date();
    const localErrors = localErrorsOf(values, now);
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    const application = toNewApplication(values, now);
    setIsSubmitting(true);
    setError(null);
    try {
      await createApplication(application);
      onCreated(application);
    } catch (failure) {
      setError(messageOf(failure));
      if (failure instanceof ApiError) setFieldErrors(fieldErrorsFrom(failure.details, API_FIELDS));
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
        <DateField
          id={ids.date}
          label="Date de candidature"
          value={values.appliedOn}
          min={EARLIEST_DATE_INPUT}
          max={today}
          error={fieldErrors.appliedOn}
          onChange={(appliedOn) => update({ appliedOn })}
        />
        <TextAreaField
          id={ids.description}
          className="new-application__wide"
          label="Description de l’offre"
          value={values.offerDescription}
          maxLength={OFFER_DESCRIPTION_MAX_LENGTH}
          hint="Facultatif — le texte de l’annonce, pour le retrouver plus tard."
          error={fieldErrors.offerDescription}
          onChange={(offerDescription) => update({ offerDescription })}
        />
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
