import { createHash } from 'node:crypto';

const HOUR_MS = 60 * 60 * 1000;
/** EF-VEI-42: the first spacing, doubled at each identical check, never beyond three days. */
const FIRST_SPACING_MS = 8 * HOUR_MS;
const MAX_SPACING_MS = 72 * HOUR_MS;

/**
 * EF-VEI-41: the fingerprint of what a source publishes — its offers' identifiers, sorted and each once —, so that
 * the same offers in another order, or a page whose layout changed, are recognised as unchanged.
 * @req EF-VEI-41
 */
export const fingerprintOf = (externalIds: readonly string[]): string =>
  createHash('sha256')
    .update([...new Set(externalIds)].sort().join('\n'))
    .digest('hex');

/** The pace of a source after a check, as `watched_sites` keeps it. */
export interface Pace {
  fingerprint: string;
  unchangedChecks: number;
  /** Null: read at every scheduled pass (EF-VEI-06). */
  nextCheckAt: Date | null;
}

/**
 * EF-VEI-42: after n identical consecutive checks, the scheduled pass waits 8 h × 2^(n-1), 72 h at most, before
 * reading the source again; a change brings it back to every pass.
 * @req EF-VEI-42
 */
export const paceAfter = (
  previous: { fingerprint: string | null; unchangedChecks: number },
  check: { fingerprint: string; checkedAt: Date },
): Pace => {
  if (previous.fingerprint !== check.fingerprint) {
    return { fingerprint: check.fingerprint, unchangedChecks: 0, nextCheckAt: null };
  }
  const unchangedChecks = previous.unchangedChecks + 1;
  const spacing = Math.min(FIRST_SPACING_MS * 2 ** (unchangedChecks - 1), MAX_SPACING_MS);
  return {
    fingerprint: check.fingerprint,
    unchangedChecks,
    nextCheckAt: new Date(check.checkedAt.getTime() + spacing),
  };
};
