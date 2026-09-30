import { useId, useState } from 'react';
import {
  type Application,
  deleteApplication,
  fetchApplication,
  updateApplication,
} from '../../api/applications';
import { messageOf } from '../../api/client';
import type { ApplicationStatus } from '../../api/stats';
import { Flash } from '../../components/Flash';
import { StatusTag } from '../../components/StatusTag';
import {
  APPLICATION_STATUSES,
  CONTRACT_LABELS,
  STATUS_LABELS,
  formatDate,
  toApplicationStatus,
} from '../../lib/format';
import { Chronology } from './Chronology';
import { OfferDetails } from './OfferDetails';
import './ApplicationItem.css';

interface ApplicationItemProps {
  application: Application;
  onUpdated: (application: Application) => void;
}

interface DeletableItemProps extends ApplicationItemProps {
  onDeleted: (id: number) => void;
  /** EF-CAN-20: in a list not grouped by company, each application says which company it is at. */
  showsCompany?: boolean;
  /** Listed under the heading of its day of application: the date is not repeated on the line. */
  isDated?: boolean;
}

// « Non précisé », « Autre contrat »: said on every line, they told nothing.
const UNINFORMATIVE_CONTRACTS: ReadonlySet<Application['contractType']> = new Set(['non_precise', 'autre']);
// RG-03: the title given to an application whose messages named no position.
const UNNAMED_TITLE = 'Candidature';

/**
 * « CDI · via Free-Work · candidature du 3 sept. 2026 », plus the last activity when it happened another day. Under a
 * heading that already gives the day, the date of application is left to screen readers only.
 */
function Summary({ application, isDated }: { application: Application; isDated: boolean }) {
  const applied = formatDate(application.appliedAt);
  const lastActivity = formatDate(application.lastActivityAt);
  const visible = [
    ...(UNINFORMATIVE_CONTRACTS.has(application.contractType)
      ? []
      : [CONTRACT_LABELS[application.contractType]]),
    application.platform ? `via ${application.platform}` : 'Envoi direct',
    ...(isDated ? [] : [`candidature du ${applied}`]),
    ...(lastActivity === applied ? [] : [`dernière activité le ${lastActivity}`]),
  ].join(' · ');
  return (
    <span className="application__meta">
      {visible}
      {isDated && <span className="visually-hidden"> · candidature du {applied}</span>}
    </span>
  );
}

/** EF-CAN-07: the new status is saved at once; the list then shows the application as the API sees it. */
function StatusChanger({ application, onUpdated }: ApplicationItemProps) {
  const selectId = useId();
  const [pending, setPending] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (value: string) => {
    const status = toApplicationStatus(value);
    if (!status) return;
    setPending(status);
    setError(null);
    try {
      await updateApplication(application.id, { status });
      onUpdated(await fetchApplication(application.id));
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="status-changer">
      <div className="form-field status-changer__field">
        <label className="form-field__label" htmlFor={selectId}>
          Changer le statut
        </label>
        <select
          id={selectId}
          className="control"
          value={pending ?? application.status}
          disabled={pending !== null}
          aria-busy={pending !== null}
          onChange={(event) => void handleChange(event.target.value)}
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>
      {pending && (
        <p className="status-changer__pending" role="status">
          Enregistrement…
        </p>
      )}
      {error && <Flash>{error}</Flash>}
    </div>
  );
}

/**
 * EF-CAN-09: deletes the application after a confirmation that says what stays — its messages remain in Gmail.
 * The destructive button never reads as the main action (HIG).
 */
function DeleteAction({
  application,
  onDeleted,
}: {
  application: Application;
  onDeleted: (id: number) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteApplication(application.id);
      onDeleted(application.id);
    } catch (failure) {
      setError(messageOf(failure));
      setIsDeleting(false);
    }
  };

  if (!isConfirming) {
    return (
      <div className="application__delete">
        <button
          type="button"
          className="btn btn--quiet btn--small btn--quiet-danger"
          onClick={() => setIsConfirming(true)}
        >
          Supprimer la candidature
        </button>
      </div>
    );
  }
  return (
    <div className="application__delete" role="group" aria-label="Confirmer la suppression">
      <p className="application__delete-text">
        Supprimer « {application.jobTitle} » chez {application.company.name} ? Les messages restent dans
        Gmail.
      </p>
      {error && <Flash>{error}</Flash>}
      <div className="application__delete-buttons">
        <button type="button" className="btn btn--quiet btn--small" onClick={() => setIsConfirming(false)}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn--danger btn--small"
          disabled={isDeleting}
          aria-busy={isDeleting}
          onClick={() => void handleDelete()}
        >
          {isDeleting ? 'Suppression…' : 'Supprimer définitivement'}
        </button>
      </div>
    </div>
  );
}

/**
 * One application of a company group: summary (title, contract, channel, last activity, status, « à relancer »
 * badge — EF-CAN-12) that opens its detail: status change (EF-CAN-07), details, chronology (EF-CAN-04, 05) and
 * deletion (EF-CAN-09).
 */
export function ApplicationItem({
  application,
  onUpdated,
  onDeleted,
  showsCompany = false,
  isDated = false,
}: DeletableItemProps) {
  const detailId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <li className="application">
      <button
        type="button"
        className="application__summary"
        aria-expanded={isOpen}
        aria-controls={detailId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="application__main">
          {showsCompany && <span className="application__company">{application.company.name}</span>}
          {application.jobTitle === UNNAMED_TITLE ? (
            <span className="application__title application__title--unnamed">Poste non précisé</span>
          ) : (
            <span className="application__title">{application.jobTitle}</span>
          )}
          <Summary application={application} isDated={isDated} />
        </span>
        <span className="application__tags">
          {application.isFollowUpDue && <span className="application__badge">À relancer</span>}
          <StatusTag status={application.status} />
        </span>
        <span className="application__chevron" aria-hidden="true" />
      </button>

      <div id={detailId} className="application__detail" hidden={!isOpen}>
        {isOpen && (
          <>
            <StatusChanger application={application} onUpdated={onUpdated} />
            <OfferDetails application={application} onUpdated={onUpdated} />
            <Chronology applicationId={application.id} />
            <DeleteAction application={application} onDeleted={onDeleted} />
          </>
        )}
      </div>
    </li>
  );
}
