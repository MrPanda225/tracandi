/** ENF-RGP-06: how long the result of an analysis stays in memory before it is erased. */
export const ANALYSIS_TTL_MS = 30 * 60 * 1000;

/** Results of the analyses, held in this process only: never in the database, on disk or in the journals. */
export interface AnalysisResults<T> {
  /** Keeps the result of run `runId` for its owner, and schedules its erasure. */
  save: (userId: number, runId: number, result: T) => void;
  /** The result, or `null` when it is erased, belongs to another account or never existed (EF-AUT-06). */
  find: (userId: number, runId: number) => T | null;
  /** How many results are held right now. */
  size: () => number;
}

/**
 * In-memory store of the analyses of the CV workshop. Each result is erased 30 minutes after it is saved, whether
 * or not anyone asks for it again (ENF-RGP-06); a restart of the server erases them all.
 * @req ENF-RGP-06, EF-CVX-32
 */
export const createAnalysisResults = <T>(ttlMs: number = ANALYSIS_TTL_MS): AnalysisResults<T> => {
  const held = new Map<number, { userId: number; result: T }>();
  return {
    save(userId, runId, result) {
      held.set(runId, { userId, result });
      // unref: an erasure still to come never keeps the process alive at shutdown.
      setTimeout(() => held.delete(runId), ttlMs).unref();
    },
    find(userId, runId) {
      const entry = held.get(runId);
      return entry && entry.userId === userId ? entry.result : null;
    },
    size: () => held.size,
  };
};
