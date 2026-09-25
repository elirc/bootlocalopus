// Runs fine; every result comes back as `unknown`, so each caller casts:
// `const { user } = (await parallel({ user: fetchUser })) as { user: User }`.

export type Task<T = unknown> = () => Promise<T>;

// TODO: what a task resolves to.
export type ResultOf<F> = unknown;

// TODO: map each task to its result, keeping objects as objects and tuples as tuples.
export type Results<T> = Record<string, unknown>;

export type Settled<V> =
  | { status: 'fulfilled'; value: V }
  | { status: 'rejected'; reason: unknown };

export async function parallel(tasks: Record<string, Task>): Promise<Record<string, unknown>> {
  const keys = Object.keys(tasks);
  const values = await Promise.all(keys.map((key) => tasks[key]()));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}

export async function all(...tasks: Task[]): Promise<unknown[]> {
  return Promise.all(tasks.map((task) => task()));
}

export async function settle(tasks: Record<string, Task>): Promise<Record<string, Settled<unknown>>> {
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
  return Object.fromEntries(entries);
}
