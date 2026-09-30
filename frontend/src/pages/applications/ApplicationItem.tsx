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

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const relativeFormat = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
// Beyond a month, a date says more than « il y a 7 semaines ».
const RELATIVE_DAYS_MAX = 30;
const NOTE_PREVIEW_LENGTH = 90;

/** « il y a 3 heures », « hier », « il y a 5 jours », then the date: how fresh the last news is, at a glance. */
const freshnessOf = (iso: string, now: Date): string => {
  const elapsed = now.getTime() - new Date(iso).getTime();
  if (elapsed < DAY_MS) return relativeFormat.format(-Math.max(1, Math.round(elapsed / HOUR_MS)), 'hour');
  const days = Math.round(elapsed / DAY_MS);
  return days <= RELATIVE_DAYS_MAX ? relativeFormat.format(-days, 'day') : `le ${formatDate(iso)}`;
};

/**
 * What is worth knowing at a glance, one column each on a wide screen: the channel, the contract when known, the
 * date of application (left to screen readers under the heading of its day) and how fresh the last activity is.
 */
function Facts({ application, isDated }: { application: Application; isDated: boolean }) {
  const applied = formatDate(application.appliedAt);
  const contract = UNINFORMATIVE_CONTRACTS.has(application.contractType)
    ? null
    : CONTRACT_LABELS[application.contractType];
  return (
    <span className="application__facts">
      <span className="application__fact application__fact--channel">
        {application.platform ? `via ${application.platform}` : 'Envoi direct'}
      </span>
      <span className="application__fact application__fact--contract">{contract}</span>
      <span className="application__fact application__fact--activity">
        <span className={isDated ? 'visually-hidden' : undefined}>candidature du {applied}</span>
        {isDated ? '' : ' · '}
        <span className="application__fact-label">dernière activité </span>
        {freshnessOf(application.lastActivityAt, new Date())}
      </span>
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
          {application.notes && (
            <span className="application__note">
              {application.notes.length > NOTE_PREVIEW_LENGTH
                ? `${application.notes.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}…`
                : application.notes}
            </span>
          )}
        </span>
        <Facts application={application} isDated={isDated} />
        <span className="application__tags">
          {/* The status first: always at the same place, top right on a phone, at the head of its column. */}
          <StatusTag status={application.status} />
          {application.isFollowUpDue && <span className="application__badge">À relancer</span>}
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
