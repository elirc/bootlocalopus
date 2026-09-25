/** Every value unwrapped. Homomorphic, so an object stays an object and a tuple stays a tuple. */
export type AwaitedValues<T> = { [K in keyof T]: Awaited<T[K]> };

/** What each task resolves to, position by position. `-readonly` so the result is a plain tuple. */
export type TaskResults<T extends readonly unknown[]> = {
  -readonly [K in keyof T]: T[K] extends () => infer R ? Awaited<R> : never;
};

export type Settled<V> =
  | { status: 'fulfilled'; value: V }
  | { status: 'rejected'; reason: unknown };

export type SettledValues<T> = { [K in keyof T]: Settled<Awaited<T[K]>> };

/** Promise.all for an object of promises (or plain values). */
export async function allObject<T extends Record<string, unknown>>(tasks: T): Promise<AwaitedValues<T>> {
  const keys = Object.keys(tasks);
  const values = await Promise.all(keys.map((key) => tasks[key]));
  // Object.fromEntries cannot know which key got which value; the loop above guarantees it.
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

/**
 * Start every task at once. `readonly [...T]` asks the compiler to infer a
 * tuple from the array literal instead of widening it to an array.
 */
export function runAll<T extends readonly (() => unknown)[]>(tasks: readonly [...T]): Promise<TaskResults<T>> {
  return Promise.all(tasks.map((task) => task())) as Promise<TaskResults<T>>;
}
