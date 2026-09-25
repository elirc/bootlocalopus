// TODO: every value of T unwrapped (works for objects AND tuples).
export type AwaitedValues<T> = T;

// TODO: what each task in the tuple T resolves to, position by position.
export type TaskResults<T extends readonly unknown[]> = unknown[];

export type Settled<V> =
  | { status: 'fulfilled'; value: V }
  | { status: 'rejected'; reason: unknown };

// TODO: every value of T as a Settled of its unwrapped type.
export type SettledValues<T> = Record<string, Settled<unknown>>;

/** Promise.all for an object of promises (or plain values). */
export async function allObject<T extends Record<string, unknown>>(tasks: T): Promise<AwaitedValues<T>> {
  const keys = Object.keys(tasks);
  const values = await Promise.all(keys.map((key) => tasks[key]));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]])) as AwaitedValues<T>;
}

/** Like allObject, but one failure does not hide the other results. */
export async function settleObject<T extends Record<string, unknown>>(tasks: T): Promise<SettledValues<T>> {
  const keys = Object.keys(tasks);
  const results = await Promise.allSettled(keys.map((key) => tasks[key]));
  return Object.fromEntries(keys.map((key, i) => {
    const r = results[i];
    return [key, r.status === 'fulfilled' ? { status: 'fulfilled', value: r.value } : { status: 'rejected', reason: r.reason }];
  })) as SettledValues<T>;
}

// TODO: the result should be a tuple matching the tasks, not unknown[].
export function runAll(tasks: (() => unknown)[]): Promise<unknown[]> {
  return Promise.all(tasks.map((task) => task()));
}
