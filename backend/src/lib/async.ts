/**
 * Maps the items with at most `limit` calls in flight; the results keep the order of the items.
 * Rejects with the first failure: calls already started run to their end, none starts after it.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  map: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  // One iterator shared by the workers: each item is taken by exactly one of them.
  const pending = items.entries();
  let hasFailed = false;
  const work = async (): Promise<void> => {
    for (const [index, item] of pending) {
      if (hasFailed) return;
      try {
        results[index] = await map(item);
      } catch (error) {
        hasFailed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return results;
};

/** A bounded number of slots shared by tasks: at most that many run at once, the others wait their turn. */
export interface Slots {
  /**
   * Runs the task once a slot is free, in the order of the calls; frees the slot however the task ends. A background
   * task — the pass of the clock, which nobody waits for — gives way to the others: when a slot is freed, a task that
   * someone waits for takes it first.
   */
  run: <T>(task: () => Promise<T>, options?: { background?: boolean }) => Promise<T>;
}

/**
 * Creates `count` slots. Waiting tasks start first come, first served, those that someone waits for before the
 * background ones; a failing task frees its slot and its failure reaches the caller.
 * @throws RangeError when `count` is not an integer of at least 1.
 * @req EF-EXE-06
 */
export const createSlots = (count: number): Slots => {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('slots must be an integer of at least 1');
  let free = count;
  const waiting: (() => void)[] = [];
  const waitingInBackground: (() => void)[] = [];

  const acquire = (background: boolean): Promise<void> => {
    if (free > 0) {
      free -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => (background ? waitingInBackground : waiting).push(resolve));
  };
  // The slot passes straight to the next waiting task, so a new caller can never overtake it.
  const release = (): void => {
    const next = waiting.shift() ?? waitingInBackground.shift();
    if (next) next();
    else free += 1;
  };

  return {
    async run(task, { background = false } = {}) {
      await acquire(background);
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
};

/**
 * Runs the tasks that share a key one after the other, in the order they asked, whatever the others do. The tasks of
 * other keys are not held back. A task that fails hands its failure to its caller and does not stop the next one.
 * Used where a count is read and then written for one candidate: two requests of theirs must not both read the same
 * count (the daily allowances, ENF-COU-01).
 */
export const createKeyedMutex = <K>() => {
  const tails = new Map<K, Promise<unknown>>();
  return <T>(key: K, task: () => Promise<T>): Promise<T> => {
    const result = (tails.get(key) ?? Promise.resolve()).then(task);
    // What the next task waits for is the end of this one, however it ends.
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
};
