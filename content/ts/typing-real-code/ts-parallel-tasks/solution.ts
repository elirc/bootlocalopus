/** A unit of async work that has not started yet. */
export type Task<T = unknown> = () => Promise<T>;

/** What a task resolves to. */
export type ResultOf<F> = F extends () => Promise<infer V> ? V : never;

/**
 * Maps each task to its result. A homomorphic mapped type keeps the shape of
 * what it maps: an object stays an object, and a tuple stays a tuple.
 */
export type Results<T> = { [K in keyof T]: ResultOf<T[K]> };

export type Settled<V> =
  | { status: 'fulfilled'; value: V }
  | { status: 'rejected'; reason: unknown };

export async function parallel<T extends Record<string, Task>>(tasks: T): Promise<Results<T>> {
  const keys = Object.keys(tasks);
  const values = await Promise.all(keys.map((key) => tasks[key]()));
  // Object.keys and Promise.all lose the per-key pairing; we rebuild it here.
  return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as Results<T>;
}

export async function all<T extends Task[]>(...tasks: T): Promise<Results<T>> {
  return (await Promise.all(tasks.map((task) => task()))) as Results<T>;
}

export async function settle<T extends Record<string, Task>>(
  tasks: T,
): Promise<{ [K in keyof T]: Settled<ResultOf<T[K]>> }> {
  const keys = Object.keys(tasks);
  const outcomes = await Promise.allSettled(keys.map((key) => tasks[key]()));
  const entries = keys.map((key, i) => {
    const outcome = outcomes[i];
    const settled: Settled<unknown> =
      outcome.status === 'fulfilled'
        ? { status: 'fulfilled', value: outcome.value }
        : { status: 'rejected', reason: outcome.reason };
    return [key, settled] as const;
  });
  return Object.fromEntries(entries) as { [K in keyof T]: Settled<ResultOf<T[K]>> };
}
