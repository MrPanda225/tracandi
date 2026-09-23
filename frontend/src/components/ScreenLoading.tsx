import { Skeleton } from './Skeleton';

/**
 * Waiting state of a screen fetched on demand (ENF-UTI-03): the navigation stays in place, the reader is told.
 * @req ENF-UTI-03, ENF-PERF-01
 */
export function ScreenLoading({ label }: { label: string }) {
  return (
    <div className="screen-loading" aria-live="polite" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <Skeleton width="40%" height="2rem" />
      <Skeleton width="70%" height="1rem" />
      <Skeleton width="60%" height="1rem" />
    </div>
  );
}
