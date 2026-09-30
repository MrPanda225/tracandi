import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type Application, type ApplicationFilters, fetchApplications } from '../../api/applications';
import { isAbortError, messageOf } from '../../api/client';

const PAGE_SIZE = 100;
// EF-CAN-03: one request once the user pauses, not one per keystroke.
const SEARCH_DELAY_MS = 300;

/** Last list shown during the session, with the filters it was requested for. */
interface CachedList {
  filters: ApplicationFilters;
  items: Application[];
  total: number;
}

type ApplicationsCache = readonly [CachedList | null, (list: CachedList) => void];

const ApplicationsCacheContext = createContext<ApplicationsCache | null>(null);

/**
 * Keeps the last list of applications while the user stays signed in, so that coming back to the screen shows it
 * at once, with the same filters. Mounted under the session guard: signing out unmounts it, so the next account
 * never sees it (EF-AUT-06).
 */
export function ApplicationsCacheProvider({ children }: { children: ReactNode }) {
  const cache = useState<CachedList | null>(null);
  return <ApplicationsCacheContext.Provider value={cache}>{children}</ApplicationsCacheContext.Provider>;
}

const useApplicationsCache = (): ApplicationsCache => {
  const cache = useContext(ApplicationsCacheContext);
  if (!cache) throw new Error('useApplications must be used within ApplicationsCacheProvider');
  return cache;
};

/** Filters of the last list of the session, to open the screen as the user left it. */
export const useLastApplicationFilters = (): ApplicationFilters | undefined =>
  useApplicationsCache()[0]?.filters;

const sameFilters = (a: ApplicationFilters, b: ApplicationFilters): boolean =>
  a.status === b.status && a.contractType === b.contractType && a.q === b.q;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface ListState {
  items: Application[];
  total: number;
  /** False until a list is on screen: the skeleton is shown only then, not on every filter change. */
  hasLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

export interface ApplicationList extends ListState {
  loadMore: () => Promise<void>;
  /** Replaces one application in place, after a change made from the list (EF-CAN-07). */
  replaceItem: (application: Application) => void;
  /** Takes one application out of the list, after its deletion (EF-CAN-09). */
  removeItem: (id: number) => void;
  /** Requests the first page again, after a creation (EF-CAN-06). */
  reload: () => void;
}

/**
 * The user's applications matching `filters`, one page of 100 at a time (EF-CAN-01, 02, 03, 14). The last list of
 * the session is shown at once and refreshed (stale-while-revalidate). A newer filter cancels the previous request;
 * a page loaded for an older filter is dropped. Must be used under ApplicationsCacheProvider.
 */
export function useApplications(filters: ApplicationFilters): ApplicationList {
  const [cached, setCached] = useApplicationsCache();
  const search = useDebounced(filters.q?.trim() ?? '', SEARCH_DELAY_MS);
  const { status, contractType } = filters;
  const [reloadCount, setReloadCount] = useState(0);
  const generation = useRef(0);
  const activeFilters: ApplicationFilters = { status, contractType, q: search || undefined };
  const [state, setState] = useState<ListState>(() => {
    const isCached = cached !== null && sameFilters(cached.filters, activeFilters);
    return {
      items: isCached ? cached.items : [],
      total: isCached ? cached.total : 0,
      hasLoaded: isCached,
      isLoading: true,
      isLoadingMore: false,
      error: null,
    };
  });

  useEffect(() => {
    const controller = new AbortController();
    const requested: ApplicationFilters = { status, contractType, q: search || undefined };
    generation.current += 1;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    fetchApplications(requested, { limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then((page) => {
        setCached({ filters: requested, ...page });
        setState({ ...page, hasLoaded: true, isLoading: false, isLoadingMore: false, error: null });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setState((current) => ({ ...current, isLoading: false, error: messageOf(error) }));
      });
    return () => controller.abort();
  }, [status, contractType, search, reloadCount, setCached]);

  const loadMore = async () => {
    const requestedFor = generation.current;
    setState((current) => ({ ...current, isLoadingMore: true, error: null }));
    try {
      const page = await fetchApplications(activeFilters, { limit: PAGE_SIZE, offset: state.items.length });
      if (requestedFor !== generation.current) return;
      const items = [...state.items, ...page.items];
      setCached({ filters: activeFilters, items, total: page.total });
      setState((current) => ({ ...current, items, total: page.total, isLoadingMore: false }));
    } catch (error) {
      if (requestedFor !== generation.current) return;
      setState((current) => ({ ...current, isLoadingMore: false, error: messageOf(error) }));
    }
  };

  const replaceItem = (application: Application) => {
    const items = state.items.map((item) => (item.id === application.id ? application : item));
    setCached({ filters: activeFilters, items, total: state.total });
    setState((current) => ({ ...current, items }));
  };

  const removeItem = (id: number) => {
    const items = state.items.filter((item) => item.id !== id);
    const total = state.total - (items.length < state.items.length ? 1 : 0);
    setCached({ filters: activeFilters, items, total });
    setState((current) => ({ ...current, items, total }));
  };

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, loadMore, replaceItem, removeItem, reload };
}
