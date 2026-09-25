/**
 * The keys of `T` whose value type is assignable to `V`.
 * `-?` drops the `undefined` an optional key would otherwise add to the result,
 * and an optional key's value (`X | undefined`) only matches a `V` that allows undefined.
 */
export type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

export type Sortable = string | number | Date;

export function sortBy<T>(
  items: readonly T[],
  key: KeysMatching<T, Sortable>,
  direction: 'asc' | 'desc' = 'asc',
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  // The key's type guarantees these are Sortable; the checker cannot follow a
  // mapped type back to the value, so we say it once, here.
  const read = (item: T) => {
    const value = item[key] as Sortable;
    return value instanceof Date ? value.getTime() : value;
  };
  return [...items].sort((a, b) => {
    const x = read(a);
    const y = read(b);
    return x < y ? -sign : x > y ? sign : 0;
  });
}

export function sumBy<T>(items: readonly T[], key: KeysMatching<T, number>): number {
  let total = 0;
  for (const item of items) total += item[key] as number;
  return total;
}

export function indexBy<T, K extends KeysMatching<T, PropertyKey>>(
  items: readonly T[],
  key: K,
): Map<T[K], T> {
  const index = new Map<T[K], T>();
  for (const item of items) index.set(item[key], item);
  return index;
}
