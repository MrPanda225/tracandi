import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import {
  type Application,
  type ApplicationChanges,
  type ApplicationDetail,
  fetchApplication,
  NOTES_MAX_LENGTH,
  OFFER_DESCRIPTION_MAX_LENGTH,
  updateApplication,
} from '../../api/applications';
import type { ContractType } from '../../api/stats';
import { ApiError, isAbortError, messageOf } from '../../api/client';
import { Flash } from '../../components/Flash';
import { Skeleton } from '../../components/Skeleton';
import {
  appliedAtFromInput,
  appliedDateProblem,
  EARLIEST_DATE_INPUT,
  toDateInputValue,
} from '../../lib/dates';
import { fieldErrorsFrom } from '../../lib/fieldErrors';
import { CONTRACT_LABELS, CONTRACT_TYPES, formatDate, toContractType } from '../../lib/format';
import { DateField, TextAreaField } from './fields';
import './OfferDetails.css';

// Longer descriptions are folded to a few lines until the user asks for the whole text.
const FOLDED_LENGTH = 600;

type FieldName = 'appliedOn' | 'offerDescription' | 'notes';
type FieldErrors = Partial<Record<FieldName, string>>;

const API_FIELDS: Readonly<Record<string, FieldName>> = {
  'body.appliedAt': 'appliedOn',
  'body.offerDescription': 'offerDescription',
  'body.notes': 'notes',
};

interface FormValues {
  appliedOn: string;
  contractType: ContractType;
  offerDescription: string;
  notes: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: ApplicationDetail };

/** Only what the user changed: an unchanged day keeps the exact stored instant. */
const changesOf = (detail: ApplicationDetail, values: FormValues, now: Date): ApplicationChanges => {
  const offerDescription = values.offerDescription.trim() || null;
  const notes = values.notes.trim() || null;
  return {
    ...(values.contractType !== detail.contractType ? { contractType: values.contractType } : {}),
    ...(offerDescription !== detail.offerDescription ? { offerDescription } : {}),
    ...(notes !== detail.notes ? { notes } : {}),
    ...(values.appliedOn !== toDateInputValue(detail.appliedAt)
      ? { appliedAt: appliedAtFromInput(values.appliedOn, now) }
      : {}),
  };
};

interface OfferFormProps {
  detail: ApplicationDetail;
  onSaved: (detail: ApplicationDetail) => void;
  onCancel: () => void;
}

/**
 * EF-CAN-08, EF-CAN-13, EF-CAN-15, EF-CAN-16: what the candidate states about an application — date, contract type,
 * description of the offer and notes — changed together.
 */
function OfferForm({ detail, onSaved, onCancel }: OfferFormProps) {
  const ids = { date: useId(), contract: useId(), description: useId(), notes: useId() };
  const [values, setValues] = useState<FormValues>({
    appliedOn: toDateInputValue(detail.appliedAt),
    contractType: detail.contractType,
    offerDescription: detail.offerDescription ?? '',
    notes: detail.notes ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.getElementById(ids.date)?.focus();
  }, [ids.date]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const now = new Date();
    const dateProblem = appliedDateProblem(values.appliedOn, now);
    setFieldErrors(dateProblem ? { appliedOn: dateProblem } : {});
    if (dateProblem) return;

    const changes = changesOf(detail, values, now);
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await updateApplication(detail.id, changes);
      onSaved(await fetchApplication(detail.id));
    } catch (failure) {
      setError(messageOf(failure));
      if (failure instanceof ApiError) setFieldErrors(fieldErrorsFrom(failure.details, API_FIELDS));
      setIsSaving(false);
    }
  };

  return (
    <form
      className="offer-form"
      aria-label="Détails de la candidature"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      {error && <Flash>{error}</Flash>}
      <DateField
        id={ids.date}
        label="Date de candidature"
        value={values.appliedOn}
        min={EARLIEST_DATE_INPUT}
        max={toDateInputValue(new Date())}
        error={fieldErrors.appliedOn}
        onChange={(appliedOn) => setValues((current) => ({ ...current, appliedOn }))}
      />
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
            if (contractType) setValues((current) => ({ ...current, contractType }));
          }}
        >
          {CONTRACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTRACT_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <TextAreaField
        id={ids.description}
        label="Description de l’offre"
        value={values.offerDescription}
        maxLength={OFFER_DESCRIPTION_MAX_LENGTH}
        hint="Le texte de l’annonce ; laissez vide pour l’effacer."
        error={fieldErrors.offerDescription}
        onChange={(offerDescription) => setValues((current) => ({ ...current, offerDescription }))}
      />
      <TextAreaField
        id={ids.notes}
        label="Notes"
        value={values.notes}
        maxLength={NOTES_MAX_LENGTH}
        hint="Pour vous seul ; laissez vide pour les effacer."
        error={fieldErrors.notes}
        onChange={(notes) => setValues((current) => ({ ...current, notes }))}
      />
      <div className="offer-form__actions">
        <button type="button" className="btn btn--quiet" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={isSaving} aria-busy={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function Description({ text }: { text: string | null }) {
  const [isUnfolded, setIsUnfolded] = useState(false);
  if (!text) return <p className="offer-details__empty">Aucune description enregistrée.</p>;
  const isLong = text.length > FOLDED_LENGTH;
  return (
    <>
      <p className={`offer-details__text${isLong && !isUnfolded ? ' offer-details__text--folded' : ''}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          className="offer-details__toggle"
          onClick={() => setIsUnfolded((open) => !open)}
        >
          {isUnfolded ? 'Réduire la description' : 'Afficher toute la description'}
        </button>
      )}
    </>
  );
}

interface OfferDetailsProps {
  application: Application;
  /** Called with the application as the API sees it after a change, to refresh the list. */
  onUpdated: (application: Application) => void;
}

/**
 * Offer block of an opened application: application date and description of the offer (EF-CAN-15, EF-CAN-16),
 * loaded from the detail endpoint when the application is opened (the list never carries the description).
 */
export function OfferDetails({ application, onUpdated }: OfferDetailsProps) {
  const titleId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchApplication(application.id, controller.signal)
      .then((detail) => setState({ status: 'ready', detail }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setState({ status: 'error', message: messageOf(error) });
      });
    return () => controller.abort();
  }, [application.id]);

  const closeForm = () => {
    setIsEditing(false);
    editButtonRef.current?.focus();
  };

  const handleSaved = (detail: ApplicationDetail) => {
    setState({ status: 'ready', detail });
    onUpdated(detail);
    closeForm();
  };

  if (state.status === 'loading') {
    return (
      <div className="offer-details" role="status" aria-live="polite">
        <span className="visually-hidden">Chargement de l’offre…</span>
        <Skeleton width="35%" height="0.9rem" />
        <Skeleton width="100%" height="3rem" />
      </div>
    );
  }
  if (state.status === 'error') return <Flash>{state.message}</Flash>;

  return (
    <section className="offer-details" aria-labelledby={titleId}>
      <div className="offer-details__header">
        <h3 id={titleId} className="offer-details__title">
          Offre
        </h3>
        {!isEditing && (
          <button
            ref={editButtonRef}
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => setIsEditing(true)}
          >
            Modifier <span className="visually-hidden">la candidature</span>
          </button>
        )}
      </div>
      {isEditing ? (
        <OfferForm detail={state.detail} onSaved={handleSaved} onCancel={closeForm} />
      ) : (
        <>
          <p className="offer-details__date">Candidature du {formatDate(state.detail.appliedAt)}</p>
          <Description text={state.detail.offerDescription} />
          {state.detail.notes && <p className="offer-details__notes">Notes : {state.detail.notes}</p>}
        </>
      )}
    </section>
  );
}
