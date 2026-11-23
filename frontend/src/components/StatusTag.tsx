import type { ApplicationStatus } from '../api/stats';
import { STATUS_LABELS } from '../lib/format';
import './StatusTag.css';

type StatusTone = 'to-apply' | 'in-progress' | 'offer' | 'rejected';

/** EF-CAN-22: colour family of each status. */
const STATUS_TONE: Record<ApplicationStatus, StatusTone> = {
  to_apply: 'to-apply',
  sent: 'in-progress',
  acknowledged: 'in-progress',
  technical_test: 'in-progress',
  interview: 'in-progress',
  offer: 'offer',
  rejected: 'rejected',
};

/**
 * Status of an application: coloured dot + French label, never colour alone (WCAG 1.4.1).
 * @req EF-CAN-22
 */
export function StatusTag({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`status-tag status-tag--${STATUS_TONE[status]}`}>
      <span className="status-tag__dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * « À relancer » marker of an application waiting without reply (RG-06), dark red, label always shown.
 * @req EF-CAN-12, EF-CAN-22
 */
export function FollowUpDueTag() {
  return (
    <span className="status-tag status-tag--no-reply">
      <span className="status-tag__dot" aria-hidden="true" />À relancer
    </span>
  );
}

/**
 * CSS custom property holding the colour of a status, for charts (same colour as the tag text).
 * @req EF-CAN-22
 */
export const statusColorVar = (status: ApplicationStatus): string => `var(--application-${STATUS_TONE[status]})`;
