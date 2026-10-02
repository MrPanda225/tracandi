import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRun, type RunState } from '../../../api/jobs';
import { useRunFeed } from './runFeed';

// The stream does not replay what happened before it opened or while it was cut: a short run is caught by this check.
const CHECK_EVERY_MS = 2000;

/** Where a followed run stands: waiting for its turn, going — with the steps done so far — or over. */
export interface FollowedRun {
  runId: number;
  outcome: RunState['outcome'];
  /** EF-CVX-43: `cv_steps_done`, 1 once the CV is read, 2 once the profile is deduced. */
  stepsDone: number;
  /** The French reason an execution that did not succeed gives (EF-EXE-03). */
  error: string | null;
}

const progressOf = (run: RunState): FollowedRun => ({
  runId: run.id,
  outcome: run.outcome,
  stepsDone: run.counters['cv_steps_done'] ?? 0,
  error: run.error,
});

/** True while the followed run has not ended. */
export const isOngoing = (run: FollowedRun | null): boolean =>
  run !== null && (run.outcome === 'queued' || run.outcome === 'running');

/**
 * Follows one execution of the queue — the reading of a CV type or of a chosen offer — from its identifier (EF-EXE-01):
 * live through the shared stream (EF-EXE-04), and by a check every 2 s, the first one at once, for a run that ended
 * before the stream said so. `onEnd` is called once, with the run, when it succeeds, fails or is set aside; the
 * candidate reads the reason in `error` (EF-EXE-03).
 * @req EF-CVX-43, EF-EXE-03, EF-EXE-04
 */
export function useRunFollower(onEnd: (run: FollowedRun) => void) {
  const [followed, setFollowed] = useState<FollowedRun | null>(null);
  const reported = useRef(new Set<number>());
  const onEndRef = useRef(onEnd);
  const followedId = followed?.runId ?? null;
  const isFollowing = isOngoing(followed);

  useEffect(() => {
    onEndRef.current = onEnd;
  });

  const handle = useCallback(
    (run: RunState) => {
      if (run.id !== followedId || reported.current.has(run.id)) return;
      const progress = progressOf(run);
      setFollowed(progress);
      if (isOngoing(progress)) return;
      // The stream and the check may both bring the end: it is told once.
      reported.current.add(run.id);
      onEndRef.current(progress);
    },
    [followedId],
  );

  useRunFeed(handle);

  useEffect(() => {
    if (followedId === null || !isFollowing) return;
    const check = () => void fetchRun(followedId).then(handle, () => undefined);
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [followedId, isFollowing, handle]);

  const follow = useCallback((runId: number) => {
    setFollowed({ runId, outcome: 'queued', stepsDone: 0, error: null });
  }, []);

  return { followed, isFollowing, follow };
}
