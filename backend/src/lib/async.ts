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
