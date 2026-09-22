import { useId, useState } from 'react';
import { type Application, fetchApplication, updateApplication } from '../../api/applications';
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

/** « CDI · Envoi direct · candidature du 3 sept. 2026 », plus the last activity when it happened another day. */
const summaryOf = (application: Application): string => {
  const channel = application.platform ? `via ${application.platform}` : 'Envoi direct';
  const applied = formatDate(application.appliedAt);
  const lastActivity = formatDate(application.lastActivityAt);
  return [
    CONTRACT_LABELS[application.contractType],
    channel,
    `candidature du ${applied}`,
    ...(lastActivity === applied ? [] : [`dernière activité le ${lastActivity}`]),
  ].join(' · ');
};

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
 * One application of a company group: summary (title, contract, channel, last activity, status, « à relancer »
 * badge — EF-CAN-12) that opens its detail: status change (EF-CAN-07) and chronology (EF-CAN-04, 05).
 */
export function ApplicationItem({ application, onUpdated }: ApplicationItemProps) {
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
          <span className="application__title">{application.jobTitle}</span>
          <span className="application__meta">{summaryOf(application)}</span>
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
          </>
        )}
      </div>
    </li>
  );
}
