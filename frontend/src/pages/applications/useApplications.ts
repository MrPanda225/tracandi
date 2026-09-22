import { useCallback, useEffect, useRef, useState } from 'react';
import { type Application, type ApplicationFilters, fetchApplications } from '../../api/applications';
import { isAbortError, messageOf } from '../../api/client';

const PAGE_SIZE = 100;
// EF-CAN-03: one request once the user pauses, not one per keystroke.
const SEARCH_DELAY_MS = 300;

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
  /** False until the first answer: the list shows its skeleton only then, not on every filter change. */
  hasLoaded: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
}

export interface ApplicationList extends ListState {
  loadMore: () => Promise<void>;
  /** Replaces one application in place, after a change made from the list (EF-CAN-07). */
  replaceItem: (application: Application) => void;
  /** Requests the first page again, after a creation (EF-CAN-06). */
  reload: () => void;
}

/**
 * The user's applications matching `filters`, one page of 100 at a time (EF-CAN-01, 02, 03, 14). A newer filter
 * cancels the previous request; a page loaded for an older filter is dropped.
 */
export function useApplications(filters: ApplicationFilters): ApplicationList {
  const search = useDebounced(filters.q?.trim() ?? '', SEARCH_DELAY_MS);
  const { status, contractType } = filters;
  const [reloadCount, setReloadCount] = useState(0);
  const generation = useRef(0);
  const [state, setState] = useState<ListState>({
    items: [],
    total: 0,
    hasLoaded: false,
    isLoading: true,
    isLoadingMore: false,
    error: null,
  });

  const activeFilters: ApplicationFilters = { status, contractType, q: search || undefined };

  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setState((current) => ({ ...current, isLoading: true, error: null }));
    fetchApplications({ status, contractType, q: search || undefined }, { limit: PAGE_SIZE, offset: 0 }, controller.signal)
      .then((page) =>
        setState({ ...page, hasLoaded: true, isLoading: false, isLoadingMore: false, error: null }),
      )
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setState((current) => ({ ...current, isLoading: false, error: messageOf(error) }));
      });
    return () => controller.abort();
  }, [status, contractType, search, reloadCount]);

  const loadMore = async () => {
    const requestedFor = generation.current;
    setState((current) => ({ ...current, isLoadingMore: true, error: null }));
    try {
      const page = await fetchApplications(activeFilters, { limit: PAGE_SIZE, offset: state.items.length });
      if (requestedFor !== generation.current) return;
      setState((current) => ({
        ...current,
        items: [...current.items, ...page.items],
        total: page.total,
        isLoadingMore: false,
      }));
    } catch (error) {
      if (requestedFor !== generation.current) return;
      setState((current) => ({ ...current, isLoadingMore: false, error: messageOf(error) }));
    }
  };

  const replaceItem = useCallback((application: Application) => {
    setState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === application.id ? application : item)),
    }));
  }, []);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, loadMore, replaceItem, reload };
}
