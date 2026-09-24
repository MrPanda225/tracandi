import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchEnabledFeatures, type OptionalFeature } from '../api/settings';
import { ScreenLoading } from '../components/ScreenLoading';

type EnabledFeatures = ReadonlySet<OptionalFeature>;

const FeaturesContext = createContext<EnabledFeatures | null>(null);

/**
 * Loads once the optional features the server runs, then renders the signed-in frame. Until they are known nothing
 * is routed, so a screen opened by its address is not sent away before its feature is confirmed. If they cannot be
 * read, only the core screens are shown: the server exposes no route for a disabled feature anyway (ENF-MAI-07).
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

/**
 * Renders a screen of an optional feature, or leads back to the dashboard when the feature is disabled: its address
 * opens nothing (ENF-MAI-07).
 */
export function RequireFeature({ feature, children }: { feature: OptionalFeature; children: ReactNode }) {
  return useFeature(feature) ? children : <Navigate to="/" replace />;
}
