import type { Database } from '../db/client.js';
import { createSlots } from '../lib/async.js';
import type { Clock } from '../lib/clock.js';
import type { Logger } from '../lib/logger.js';
import * as repository from './repository.js';
import type { JobName, JobRunView, RunCounter, TriggerType } from './repository.js';

export type RunCounters = Partial<Record<RunCounter, number>>;

// Same bound as job_runs.error.
const ERROR_MAX_LENGTH = 1000;

/** The message of a failure, bounded; never a stack nor an object dump (ENF-SEC-08). */
const describeFailure = (error: unknown): string =>
  (error instanceof Error ? error.message : 'Unknown failure').slice(0, ERROR_MAX_LENGTH);

/** EF-EXE-05: what closes an execution the server left behind. */
export const INTERRUPTED = 'Exécution interrompue par un arrêt du serveur';

/** One long treatment waiting its turn (EF-EXE-01). */
export interface QueuedWork {
  userId: number;
  job: JobName;
  trigger: TriggerType;
  /**
   * The treatment itself. `report` publishes what is done so far, as often as it likes; the counters it returns
   * are the ones journaled at the end.
   */
  run: (report: (counters: RunCounters) => void) => Promise<RunCounters>;
}

/** State of one execution, as the interface follows it (EF-EXE-03). */
export interface RunState {
  id: number;
  job: JobName;
  trigger: TriggerType;
  outcome: repository.RunOutcome;
  counters: RunCounters;
  error: string | null;
}

export interface JobQueue {
  /**
   * Puts a treatment in the queue of its user and hands back at once: the treatments of one candidate run one
   * after the other, in the order they were asked for (EF-EXE-01, EF-EXE-02).
   * @returns the identifier of the execution, to follow it.
   */
  enqueue: (work: QueuedWork) => Promise<number>;
  /**
   * Same, unless an execution of this job is already waiting or running for this user: it is then journaled as
   * skipped, which is what the scheduler wants (EF-GML-18).
   * @returns the identifier, or null when nothing was queued.
   */
  enqueueUnlessPending: (work: QueuedWork) => Promise<number | null>;
  /** State of an execution: the one in memory while it runs, the journaled one afterwards (EF-EXE-03). */
  stateOf: (userId: number, runId: number) => Promise<RunState | null>;
  /** EF-EXE-04: every change of state of the executions of this user, until `stop` is called. */
  follow: (userId: number, onChange: (state: RunState) => void) => () => void;
  /** EF-EXE-05: closes in failure the executions a stopped server left waiting or running. */
  closeInterrupted: () => Promise<void>;
  /** Waits for the queue to be empty; used by the tests and by the shutdown. */
  drain: () => Promise<void>;
}

const viewOf = (run: JobRunView): RunState => ({
  id: run.id,
  job: run.job,
  trigger: run.trigger,
  outcome: run.outcome,
  counters: run.counters,
  error: run.error,
});

/** What is waiting or running, with its owner, and who follows it (EF-EXE-03, EF-EXE-04). */
const createFollowerRegistry = () => {
  const live = new Map<number, { userId: number; state: RunState }>();
  const followers = new Map<number, Set<(state: RunState) => void>>();
  const isOver = (outcome: repository.RunOutcome): boolean => !['queued', 'running'].includes(outcome);

  return {
    /** An execution that is over lives in the journal, not in memory. */
    publish(userId: number, state: RunState): void {
      if (isOver(state.outcome)) live.delete(state.id);
      else live.set(state.id, { userId, state });
      for (const follower of followers.get(userId) ?? []) follower(state);
    },

    /** The state held in memory, and only for the account that owns it (EF-AUT-06). */
    liveOf(userId: number, runId: number): RunState | null {
      const known = live.get(runId);
      return known && known.userId === userId ? known.state : null;
    },

    follow(userId: number, onChange: (state: RunState) => void): () => void {
      const forUser = followers.get(userId) ?? new Set<(state: RunState) => void>();
      forUser.add(onChange);
      followers.set(userId, forUser);
      return () => {
        forUser.delete(onChange);
        if (forUser.size === 0) followers.delete(userId);
      };
    },
  };
};

type FollowerRegistry = ReturnType<typeof createFollowerRegistry>;

interface QueueDeps {
  db: Database;
  clock: Clock;
  logger: Logger;
  /** EF-EXE-06: treatments run at once on the whole server; 1 when absent. */
  maxConcurrentRuns?: number;
}

/**
 * Runs one execution and journals what it did: its counters on success, the message of its failure otherwise.
 * Never throws — the queue goes on with the next execution (ENF-FIA-01).
 */
const executeRun = async (
  deps: QueueDeps & { followers: FollowerRegistry },
  runId: number,
  work: QueuedWork,
): Promise<void> => {
  const { db, clock, logger, followers } = deps;
  await repository.startJobRun(db, runId, clock());
  const state: RunState = {
    id: runId,
    job: work.job,
    trigger: work.trigger,
    outcome: 'running',
    counters: {},
    error: null,
  };
  followers.publish(work.userId, state);
  try {
    const counters = await work.run((progress) => {
      followers.publish(work.userId, { ...state, counters: progress });
    });
    await repository.finishJobRun(db, runId, {
      finishedAt: clock(),
      outcome: 'success',
      error: null,
      counters,
    });
    followers.publish(work.userId, { ...state, outcome: 'success', counters });
  } catch (error) {
    const message = describeFailure(error);
    await repository.finishJobRun(db, runId, {
      finishedAt: clock(),
      outcome: 'failure',
      error: message,
      counters: {},
    });
    followers.publish(work.userId, { ...state, outcome: 'failure', error: message });
    logger.warn('queued job failed', { job: work.job, userId: work.userId, error });
  }
};

/**
 * Where the executions wait: one lane per candidate keeps its order (EF-EXE-02), and slots shared by all the lanes
 * bound what runs at once on the whole server (EF-EXE-06).
 */
const createLanes = (slotCount: number) => {
  const lanes = new Map<number, Promise<void>>();
  const slots = createSlots(slotCount);
  return {
    add(userId: number, task: () => Promise<void>): void {
      const previous = lanes.get(userId) ?? Promise.resolve();
      // EF-EXE-02: each execution waits for the previous one of the same candidate, and none is dropped. The lane
      // holds the promise that is stored, so the last one of a candidate clears its own entry.
      const chained: Promise<void> = previous
        .then(() => slots.run(task))
        .finally(() => {
          if (lanes.get(userId) === chained) lanes.delete(userId);
        });
      lanes.set(userId, chained);
    },
    async drain(): Promise<void> {
      while (lanes.size > 0) await Promise.all([...lanes.values()]);
    },
  };
};

/**
 * Queue of the long treatments (EXM-15). A request is journaled at once in `job_runs`, then the treatments of one
 * candidate run one after the other, and at most `maxConcurrentRuns` of them run at once on the whole server
 * (EF-EXE-06): the API never waits for one (ENF-PERF-06), and the interface follows the state it publishes
 * (EF-EXE-03, EF-EXE-04).
 * @req EF-EXE-01, EF-EXE-02, EF-EXE-03, EF-EXE-04, EF-EXE-05, EF-EXE-06, EF-GML-18, ENF-FIA-01, ENF-PERF-06
 */
export const createJobQueue = (deps: QueueDeps): JobQueue => {
  const { db, clock, logger } = deps;
  const lanes = createLanes(deps.maxConcurrentRuns ?? 1);
  const followers = createFollowerRegistry();

  const queue = async (work: QueuedWork): Promise<number> => {
    const runId = await repository.insertJobRun(db, {
      userId: work.userId,
      job: work.job,
      triggerType: work.trigger,
      startedAt: clock(),
      outcome: 'queued',
    });
    followers.publish(work.userId, {
      id: runId,
      job: work.job,
      trigger: work.trigger,
      outcome: 'queued',
      counters: {},
      error: null,
    });
    lanes.add(work.userId, () => executeRun({ ...deps, followers }, runId, work));
    return runId;
  };

  return {
    enqueue: queue,

    async enqueueUnlessPending(work) {
      if (await repository.hasPendingRun(db, work.userId, work.job)) {
        await repository.insertJobRun(db, {
          userId: work.userId,
          job: work.job,
          triggerType: work.trigger,
          startedAt: clock(),
          outcome: 'skipped',
        });
        return null;
      }
      return queue(work);
    },

    async stateOf(userId, runId) {
      const known = followers.liveOf(userId, runId);
      if (known) return known;
      const run = await repository.findJobRun(db, runId);
      // EF-AUT-06: an execution of another account is as absent as one that never existed.
      return run && run.userId === userId ? viewOf(run) : null;
    },

    follow: (userId, onChange) => followers.follow(userId, onChange),

    async closeInterrupted() {
      const closed = await repository.failInterruptedRuns(db, clock(), INTERRUPTED);
      if (closed > 0) logger.warn('executions closed after a restart', { closed });
    },

    drain: () => lanes.drain(),
  };
};
