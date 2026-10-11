import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../lib/errors.js';
import type { WatchCriteria } from '../criteria/schemas.js';
import type { ProfileService } from '../cv/service.js';
import type { CriteriaService } from '../criteria/service.js';
import { hasTargetsOf } from './service.js';

const CRITERIA = {
  targets: [{ label: 'Data analyst', keywords: ['sql'], contractTypes: ['cdi'] }],
  place: null,
  radiusKm: 30,
  acceptsRemote: true,
  romeCodes: [],
} as WatchCriteria;

const deps = (saved: WatchCriteria | null, profile: () => Promise<unknown>) => ({
  criteria: { read: () => Promise.resolve(saved) } as unknown as CriteriaService,
  profiles: { read: profile } as unknown as ProfileService,
});

describe('hasTargetsOf (review of the lot 10, EF-VEI-55)', () => {
  it('[EF-VEI-55] is true for a candidate with saved criteria, without even looking at the profile', async () => {
    const hasTargets = hasTargetsOf(deps(CRITERIA, () => Promise.reject(new Error('not read'))));

    await expect(hasTargets(1)).resolves.toBe(true);
  });

  it('[EF-VEI-31] is true for a candidate with no criteria but a profile whose targets stand for them', async () => {
    const profile = { location: { searchArea: 'Paris' }, targets: [{ label: 'Data analyst' }] };

    await expect(hasTargetsOf(deps(null, () => Promise.resolve(profile)))(1)).resolves.toBe(true);
  });

  it('[EF-VEI-55] is false for a candidate with neither criteria nor profile', async () => {
    const hasTargets = hasTargetsOf(deps(null, () => Promise.reject(new NotFoundError('no profile'))));

    await expect(hasTargets(1)).resolves.toBe(false);
  });

  it('[ENF-FIA-02] is not false but a failure when the database fails: it is not a candidate with nothing to search for', async () => {
    const hasTargets = hasTargetsOf(deps(null, () => Promise.reject(new Error('connection terminated'))));

    await expect(hasTargets(1)).rejects.toThrow('connection terminated');
  });
});
