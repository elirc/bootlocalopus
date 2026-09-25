// Every helper accepts ANY key, so `sortBy(orders, 'customer')` compiles and
// sorts by "[object Object]", and `sumBy(orders, 'id')` concatenates strings.

// TODO: the keys of T whose value type is assignable to V.
export type KeysMatching<T, V> = keyof T;

export type Sortable = string | number | Date;

export function sortBy<T>(items: readonly T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  const sign = direction === 'asc' ? 1 : -1;
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

export function sumBy<T>(items: readonly T[], key: keyof T): number {
  let total = 0;
  for (const item of items) total += item[key] as number;
  return total;
}

export function indexBy<T, K extends keyof T>(items: readonly T[], key: K): Map<T[K], T> {
  const index = new Map<T[K], T>();
  for (const item of items) index.set(item[key], item);
  return index;
}
