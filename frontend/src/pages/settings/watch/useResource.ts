import { useCallback, useEffect, useState } from 'react';
import { isAbortError, messageOf } from '../../../api/client';

/** What a panel shows of something it fetches: the wait, the French reason it failed, or the value. */
export type Resource<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; value: T };

/**
 * Fetches what a panel shows once, when it appears, and again on `reload` — after an action changed it, or for the
 * candidate to try again. A failed reload leaves the message, never the previous value: what is shown is what the API
 * last said. `load` must keep its identity from one render to the next (a function of the API module).
 * @req ENF-UTI-03
 */
export function useResource<T>(load: (signal?: AbortSignal) => Promise<T>) {
  const [resource, setResource] = useState<Resource<T>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (value) => setResource({ status: 'ready', value }),
      (error: unknown) => {
        if (!isAbortError(error)) setResource({ status: 'error', message: messageOf(error) });
      },
    );
    return () => controller.abort();
  }, [load]);

  const reload = useCallback(async () => {
    try {
      setResource({ status: 'ready', value: await load() });
    } catch (error) {
      setResource({ status: 'error', message: messageOf(error) });
    }
  }, [load]);

  return { resource, reload };
}
