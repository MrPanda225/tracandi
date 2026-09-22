/** Media query shared by every animation: when it matches, motion is replaced by instant state changes. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the user asked the system to reduce motion, or when the environment cannot tell (safe default). */
export const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia !== 'function' || window.matchMedia(REDUCED_MOTION_QUERY).matches;
