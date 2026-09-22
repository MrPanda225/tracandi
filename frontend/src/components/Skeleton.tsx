import './Skeleton.css';

interface SkeletonProps {
  width: string;
  height: string;
}

/**
 * Placeholder shape of content still loading (ENF-UTI-03). Decorative: hidden from assistive technologies, so the
 * loading screen must also announce itself with text.
 */
export function Skeleton({ width, height }: SkeletonProps) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height }} />;
}
