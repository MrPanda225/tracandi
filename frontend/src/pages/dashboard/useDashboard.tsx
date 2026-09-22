import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { type Dashboard, fetchDashboard } from '../../api/stats';

const UNEXPECTED_MESSAGE = 'Une erreur inattendue est survenue.';

type DashboardCache = readonly [Dashboard | null, (dashboard: Dashboard) => void];

const DashboardCacheContext = createContext<DashboardCache | null>(null);

/**
 * Keeps the last dashboard figures while the user stays signed in, so that coming back to the dashboard shows
 * them at once. Mounted under the session guard: signing out unmounts it, so the next account never sees them
 * (EF-AUT-06).
 */
export function DashboardCacheProvider({ children }: { children: ReactNode }) {
  const cache = useState<Dashboard | null>(null);
  return <DashboardCacheContext.Provider value={cache}>{children}</DashboardCacheContext.Provider>;
}

export interface DashboardLoad {
  /** Last figures received during this session; null until the first answer. */
  dashboard: Dashboard | null;
  /** Readable French message of the last failed request; null when it succeeded or is still running. */
  error: string | null;
  isRefreshing: boolean;
}

/**
 * Dashboard figures, requested again on every visit: the previous ones stay on screen meanwhile
 * (stale-while-revalidate). Must be used under DashboardCacheProvider.
 */
export function useDashboard(): DashboardLoad {
  const cache = useContext(DashboardCacheContext);
  if (!cache) throw new Error('useDashboard must be used within DashboardCacheProvider');
  const [dashboard, setDashboard] = cache;
  const [request, setRequest] = useState<Omit<DashboardLoad, 'dashboard'>>({ error: null, isRefreshing: true });

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(controller.signal)
      .then((fresh) => {
        setDashboard(fresh);
        setRequest({ error: null, isRefreshing: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        const message = error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
        setRequest({ error: message, isRefreshing: false });
      });
    return () => controller.abort();
  }, [setDashboard]);

  return { dashboard, ...request };
}
