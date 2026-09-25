// Every function here uses a plain object as a dictionary, and a plain object
// is not empty: it inherits `toString`, `constructor`, and a `__proto__` setter.

export function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return table[key];
}

export function countBy<T>(items: Iterable<T>, keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = String(keyOf(item));
    (groups[key] ||= []).push(item);
  }
  return new Map(Object.entries(groups)) as unknown as Map<K, T[]>;
}

export function getPath(value: unknown, path: string): unknown {
  let current: any = value;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  return current;
}
