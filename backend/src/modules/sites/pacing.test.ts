import { describe, expect, it } from 'vitest';
import { fingerprintOf, paceAfter } from './pacing.js';

const AT = new Date('2026-10-01T07:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('pace of a source (EF-VEI-41, EF-VEI-42)', () => {
  it('[EF-VEI-41] gives the same fingerprint to the same offers in another order', () => {
    expect(fingerprintOf(['b', 'a', 'a'])).toBe(fingerprintOf(['a', 'b']));
    expect(fingerprintOf(['a', 'b'])).not.toBe(fingerprintOf(['a', 'c']));
  });

  it.each([
    [0, 1, 8],
    [1, 2, 16],
    [2, 3, 32],
    [3, 4, 64],
    [4, 5, 72],
    [9, 10, 72],
  ])('[EF-VEI-42] after %i identical checks, one more waits %i… hours', (before, after, hours) => {
    const pace = paceAfter(
      { fingerprint: 'f', unchangedChecks: before },
      { fingerprint: 'f', checkedAt: AT },
    );

    expect(pace.unchangedChecks).toBe(after);
    expect(pace.nextCheckAt?.getTime()).toBe(AT.getTime() + hours * HOUR);
  });

  it('[EF-VEI-42] brings a source that changed back to every pass', () => {
    expect(paceAfter({ fingerprint: 'f', unchangedChecks: 4 }, { fingerprint: 'g', checkedAt: AT })).toEqual({
      fingerprint: 'g',
      unchangedChecks: 0,
      nextCheckAt: null,
    });
  });

  it('[EF-VEI-42] reads a source checked for the first time at every pass', () => {
    expect(
      paceAfter({ fingerprint: null, unchangedChecks: 0 }, { fingerprint: 'f', checkedAt: AT }).nextCheckAt,
    ).toBeNull();
  });
});
