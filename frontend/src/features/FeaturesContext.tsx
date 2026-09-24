import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { fetchEnabledFeatures, type OptionalFeature } from '../api/settings';
import { ScreenLoading } from '../components/ScreenLoading';
import { UpcomingPage } from '../pages/UpcomingPage';

type EnabledFeatures = ReadonlySet<OptionalFeature>;

/** `undefined` outside the provider, `null` while the list is on its way. */
const FeaturesContext = createContext<EnabledFeatures | null | undefined>(undefined);

/**
 * Loads once the optional features the server runs, while the signed-in frame and the screens of the core are
 * already shown (ENF-PERF-07). Only a screen of an optional feature waits for the list, so that it does not flash
 * « En préparation » before its feature is confirmed. If the list cannot be read, every optional feature counts as
 * disabled: the server exposes no route for one anyway (ENF-MAI-07).
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

  return <FeaturesContext.Provider value={features}>{children}</FeaturesContext.Provider>;
}

/**
 * Whether an optional feature runs on this deployment, `null` while it is not known yet; must be used under
 * FeaturesProvider.
 * @req ENF-MAI-07
 */
export function useFeature(feature: OptionalFeature): boolean | null {
  const features = useContext(FeaturesContext);
  if (features === undefined) throw new Error('useFeature must be used within FeaturesProvider');
  return features && features.has(feature);
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
  const isEnabled = useFeature(feature);
  if (isEnabled === null) return <ScreenLoading label="Chargement de l’application…" />;
  return isEnabled ? children : <UpcomingPage title={title} promise={promise} />;
}
