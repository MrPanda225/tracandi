import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '../../api/client';
import { type CvAnalysis, fetchCvAnalysis, startCvAnalysis } from '../../api/cvWorkshop';
import { fetchRun, followRuns, type RunState } from '../../api/jobs';

// The stream does not replay what happened before it opened: a quick reading is caught by this check as well.
const CHECK_EVERY_MS = 2000;

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'reading' }
  | { status: 'done'; analysis: CvAnalysis }
  | { status: 'failed'; message: string };

/** Reads a file as base64, without the `data:…;base64,` prefix. */
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('Le fichier n’a pas pu être lu par le navigateur.'));
    reader.readAsDataURL(file);
  });

/**
 * Sends a CV to the workshop and follows its analysis in the queue (EF-CVX-32): live through the stream of
 * executions (EF-EXE-04), and by a check every 2 s in case the reading ended before the stream opened. The result
 * is fetched once, when the run succeeds; a failure shows the reason the API gives (EF-CVX-34).
 */
export function useCvAnalysis() {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => () => stopRef.current(), []);

  const analyse = useCallback(async (file: File) => {
    stopRef.current();
    setState({ status: 'reading' });
    let runId: number | null = null;
    let isOver = false;
    const early: RunState[] = [];

    const finish = async (run: RunState) => {
      if (isOver || run.id !== runId || run.outcome === 'queued' || run.outcome === 'running') return;
      isOver = true;
      stop();
      if (run.outcome !== 'success') {
        setState({ status: 'failed', message: run.error ?? 'La lecture du CV a échoué.' });
        return;
      }
      try {
        setState({ status: 'done', analysis: await fetchCvAnalysis(run.id) });
      } catch (error) {
        setState({ status: 'failed', message: messageOf(error) });
      }
    };
    const closeStream = followRuns((run) => {
      if (runId === null) early.push(run);
      else void finish(run);
    });
    const timer = window.setInterval(() => {
      if (runId !== null) void fetchRun(runId).then(finish, () => undefined);
    }, CHECK_EVERY_MS);
    const stop = () => {
      closeStream();
      window.clearInterval(timer);
    };
    stopRef.current = stop;

    try {
      runId = (await startCvAnalysis(await toBase64(file))).runId;
      for (const run of early) void finish(run);
    } catch (error) {
      stop();
      setState({ status: 'failed', message: messageOf(error) });
    }
  }, []);

  const reset = useCallback(() => {
    stopRef.current();
    setState({ status: 'idle' });
  }, []);

  return { state, analyse, reset };
}
