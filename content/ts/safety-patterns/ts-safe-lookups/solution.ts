/** A value stored under `key` on the table itself — never one inherited from Object.prototype. */
export function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * Counts per key. A Map has no inherited keys, so 'constructor' or '__proto__'
 * are counted like any other string; `Object.fromEntries` then defines them as
 * own properties instead of invoking the `__proto__` setter.
 */
export function countBy<T>(items: Iterable<T>, keyOf: (item: T) => string): Record<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

export function groupBy<T, K>(items: Iterable<T>, keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Reads a dotted path such as `'billing.address.city'`, following only own
 * properties. A user-supplied path like `'constructor.constructor'` would
 * otherwise walk into Object and Function, which is how template engines have
 * leaked (and executed) far more than the data they were given.
 */
export function getPath(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
