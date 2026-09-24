import { request } from './client';

/** Features a deployment may leave out (ENF-MAI-07): the offers watch and the CV workshop. */
export type OptionalFeature = 'watch' | 'cv';

/** The optional features the server runs (schema `EnabledFeatures` in /api/docs). */
export const fetchEnabledFeatures = (signal?: AbortSignal) =>
  request<{ features: OptionalFeature[] }>('/settings/features', { signal });
