// Every function here quietly assumes at least one element. Given an empty
// array, `first` returns undefined typed as T, and `maxBy` does the same.

// TODO: types that guarantee at least one element.
export type NonEmptyArray<T> = T[];
export type ReadonlyNonEmptyArray<T> = readonly T[];

export function isNonEmpty<T>(items: readonly T[]): boolean {
  return items.length > 0;
}

export function first<T>(items: readonly T[]): T {
  return items[0];
}

export function last<T>(items: readonly T[]): T {
  return items[items.length - 1];
}

export function maxBy<T>(items: readonly T[], score: (item: T) => number): T {
  let best = items[0];
  for (const item of items) if (score(item) > score(best)) best = item;
  return best;
}

export function mapNonEmpty<T, U>(items: readonly T[], fn: (item: T, index: number) => U): U[] {
  return items.map(fn);
}

export function groupByKey<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
