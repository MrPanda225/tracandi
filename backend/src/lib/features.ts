/**
 * The features a deployment may leave out (ENF-MAI-07): the offers watch (sites, offers, scheduled watch) and the CV
 * workshop (reference profile, CV). The dashboard, the applications, the Gmail synchronisation and the settings are
 * the core and always on.
 */
export const OPTIONAL_FEATURES = ['watch', 'cv'] as const;

export type OptionalFeature = (typeof OPTIONAL_FEATURES)[number];

/** The optional features this deployment runs. */
export type EnabledFeatures = ReadonlySet<OptionalFeature>;

/**
 * What a feature brings (modules, scheduled jobs…), or nothing when the feature is disabled: a disabled feature
 * exposes no route and runs no job.
 * @req ENF-MAI-07
 */
export const onlyIf = <T>(features: EnabledFeatures, feature: OptionalFeature, ...items: T[]): T[] =>
  features.has(feature) ? items : [];
