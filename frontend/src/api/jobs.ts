import { apiUrl, request } from './client';

/** Compteurs d'une exécution (schéma `RunState` dans /api/docs, EF-EXE-03). */
export type RunCounters = Partial<Record<string, number>>;

/** État d'une exécution suivie par l'interface (EF-EXE-03). */
export interface RunState {
  id: number;
  job: 'gmail_sync' | 'gmail_reclassify' | 'scraper' | 'backup' | 'cv_analysis';
  trigger: 'manual' | 'schedule';
  outcome: 'queued' | 'running' | 'success' | 'failure' | 'skipped';
  counters: RunCounters;
  error: string | null;
}

/** EF-EXE-03 : l'état d'une exécution, à la demande. */
export const fetchRun = (runId: number, signal?: AbortSignal) =>
  request<RunState>(`/jobs/${String(runId)}`, { signal });

/** Vrai tant que l'exécution n'est pas terminée. */
export const isRunning = (run: RunState | null): boolean =>
  run !== null && (run.outcome === 'queued' || run.outcome === 'running');

/**
 * EF-EXE-04 : suit en direct les exécutions du candidat. Le navigateur rouvre le flux tout seul après une coupure ;
 * la fonction rendue le ferme.
 */
export const followRuns = (onRun: (run: RunState) => void): (() => void) => {
  const source = new EventSource(apiUrl('/jobs/stream'), { withCredentials: true });
  source.addEventListener('run', (event) => {
    onRun(JSON.parse((event as MessageEvent<string>).data) as RunState);
  });
  return () => source.close();
};
