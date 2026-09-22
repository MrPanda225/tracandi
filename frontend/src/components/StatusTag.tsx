import type { ApplicationStatus } from '../api/stats';
import { STATUS_LABELS } from '../lib/format';
import './StatusTag.css';

// rules/frontend.md: colours aligned on the Gmail labels; Envoyée and Accusé reçu are both « waiting ».
const TONE: Record<ApplicationStatus, string> = {
  to_apply: 'idle',
  sent: 'waiting',
  acknowledged: 'waiting',
  interview: 'interview',
  offer: 'offer',
  rejected: 'rejected',
};

/** Status of an application: coloured dot + French label, never colour alone (WCAG 1.4.1). */
export function StatusTag({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`status-tag status-tag--${TONE[status]}`}>
      <span className="status-tag__dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

/** CSS custom property holding the solid colour of a status, for charts. */
export const statusColorVar = (status: ApplicationStatus): string => `var(--status-${TONE[status]})`;
