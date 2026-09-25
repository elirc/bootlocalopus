/** At least one element: the first is required, the rest may be empty. */
export type NonEmptyArray<T> = [T, ...T[]];
export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];

/**
 * An explicit predicate: TypeScript never infers one from `length > 0`.
 * A readonly parameter accepts both kinds of array; narrowing a mutable
 * `T[]` with it keeps the array mutable (the result is an intersection).
 */
export function isNonEmpty<T>(items: readonly T[]): items is ReadonlyNonEmptyArray<T> {
  return items.length > 0;
}

export function first<T>(items: ReadonlyNonEmptyArray<T>): T {
  return items[0];
}

export function last<T>(items: ReadonlyNonEmptyArray<T>): T {
  return items[items.length - 1];
}

/** Cannot fail: there is always a best element. */
export function maxBy<T>(items: ReadonlyNonEmptyArray<T>, score: (item: T) => number): T {
  let best = items[0];
  let bestScore = score(best);
  for (const item of items.slice(1)) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

export function mapNonEmpty<T, U>(items: ReadonlyNonEmptyArray<T>, fn: (item: T, index: number) => U): NonEmptyArray<U> {
  const [head, ...tail] = items;
  return [fn(head, 0), ...tail.map((item, i) => fn(item, i + 1))];
}

/** Every group exists because an item was put in it, so every group is non-empty. */
export function groupByKey<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, NonEmptyArray<T>> {
  const groups = new Map<K, NonEmptyArray<T>>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
