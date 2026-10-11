import { type ReactNode, useId } from 'react';
import { Flash } from '../../../components/Flash';
import { Skeleton } from '../../../components/Skeleton';

/** A titled part of the « Veille automatique » card (Gestalt proximity); a region, so that assistive technologies list it. */
export function WatchSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="gmail-card__section" aria-labelledby={titleId}>
      <h3 id={titleId} className="gmail-card__section-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** ENF-UTI-03: the wait said in words — the skeleton is hidden from assistive technologies. */
export function PanelLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="watch-loading">
      <span className="visually-hidden">{label}</span>
      <Skeleton width="100%" height="2.75rem" />
    </div>
  );
}

/** ENF-UTI-03: a failure is never silent, and never a dead end: the candidate can ask again. */
export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="watch-failure">
      <Flash>{message}</Flash>
      <button type="button" className="btn btn--quiet btn--small" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
