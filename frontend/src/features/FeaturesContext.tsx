import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { fetchEnabledFeatures, type OptionalFeature } from '../api/settings';
import { ScreenLoading } from '../components/ScreenLoading';
import { UpcomingPage } from '../pages/UpcomingPage';

type EnabledFeatures = ReadonlySet<OptionalFeature>;

const FeaturesContext = createContext<EnabledFeatures | null>(null);

/**
 * Loads once the optional features the server runs, then renders the signed-in frame. Until they are known nothing
 * is routed, so a screen opened by its address does not flash « En préparation » before its feature is confirmed. If
 * they cannot be read, every optional feature counts as disabled: the server exposes no route for one anyway
 * (ENF-MAI-07).
 */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<EnabledFeatures | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEnabledFeatures(controller.signal)
      .then((answer) => setFeatures(new Set(answer.features)))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFeatures(new Set());
      });
    return () => controller.abort();
  }, []);

  if (!features) return <ScreenLoading label="Chargement de l’application…" />;
  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

/**
 * Whether an optional feature runs on this deployment; must be used under FeaturesProvider.
 * @req ENF-MAI-07
 */
export function useFeature(feature: OptionalFeature): boolean {
  return useFeatures().has(feature);
}

/** The optional features this deployment runs; must be used under FeaturesProvider. */
export function useFeatures(): EnabledFeatures {
  const features = useContext(FeaturesContext);
  if (!features) throw new Error('useFeatures must be used within FeaturesProvider');
  return features;
}

interface RequireFeatureProps {
  feature: OptionalFeature;
  /** Heading and promise of the « En préparation » screen shown while the feature is disabled. */
  title: string;
  promise: string;
  children: ReactNode;
}

/**
 * Renders a screen of an optional feature, or, while the feature is disabled, the « En préparation » screen in its
 * place: the navigation keeps every screen, and the disabled content is neither loaded nor called (ENF-MAI-07).
 */
export function RequireFeature({ feature, title, promise, children }: RequireFeatureProps) {
  return useFeature(feature) ? children : <UpcomingPage title={title} promise={promise} />;
}
