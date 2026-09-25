export type Guard<T> = (value: unknown) => value is T;

/** A non-null, non-array object: something you can read keys from. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Narrows to "has this own key"; chaining two calls intersects them. */
export function hasKey<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return isRecord(value) && Object.hasOwn(value, key);
}

/** Has this own key, and its value passes the guard. */
export function hasKeyOf<K extends string, T>(value: unknown, key: K, guard: Guard<T>): value is Record<K, T> {
  return hasKey(value, key) && guard(value[key]);
}

export function isArrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => Array.isArray(value) && value.every(guard);
}

/** One of a fixed set of string literals: `isOneOf('open', 'paid')` guards `'open' | 'paid'`. */
export function isOneOf<T extends string>(...allowed: T[]): Guard<T> {
  return (value): value is T => typeof value === 'string' && (allowed as string[]).includes(value);
}

export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}

export const isString: Guard<string> = (value): value is string => typeof value === 'string';
export const isNumber: Guard<number> = (value): value is number => typeof value === 'number' && Number.isFinite(value);
