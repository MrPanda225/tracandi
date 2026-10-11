import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { followRuns, type RunState } from '../../../api/jobs';

type RunListener = (run: RunState) => void;
type Subscribe = (listener: RunListener) => () => void;

const RunFeedContext = createContext<Subscribe | null>(null);

/**
 * One stream of the candidate's executions for the whole « Veille automatique » section (EF-EXE-04), shared by every
 * panel that follows a run: a browser allows a handful of open connections to one host, and the Gmail card already
 * holds one of them.
 */
export function RunFeedProvider({ children }: { children: ReactNode }) {
  const [listeners] = useState(() => new Set<RunListener>());
  const [subscribe] = useState<Subscribe>(() => (listener: RunListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  });

  useEffect(
    () =>
      followRuns((run) => {
        for (const listener of listeners) listener(run);
      }),
    [listeners],
  );

  return <RunFeedContext.Provider value={subscribe}>{children}</RunFeedContext.Provider>;
}

/**
 * Calls `onRun` for every change of state of the candidate's executions while the component is shown; must be used
 * under RunFeedProvider. `onRun` should keep its identity from one render to the next.
 * @req EF-EXE-04
 */
export function useRunFeed(onRun: RunListener): void {
  const subscribe = useContext(RunFeedContext);
  if (subscribe === null) throw new Error('useRunFeed must be used within RunFeedProvider');
  useEffect(() => subscribe(onRun), [subscribe, onRun]);
}
