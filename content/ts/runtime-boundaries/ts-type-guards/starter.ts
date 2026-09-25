export type Guard<T> = (value: unknown) => value is T;

// The runtime checks are right. None of these tell the compiler anything yet:
// a function returning `boolean` does not narrow its argument.

export function isRecord(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasKey(value: unknown, key: string): boolean {
  return isRecord(value) && Object.hasOwn(value as object, key);
}

export function hasKeyOf(value: unknown, key: string, guard: (value: unknown) => boolean): boolean {
  return hasKey(value, key) && guard((value as Record<string, unknown>)[key]);
}

export function isArrayOf(guard: (value: unknown) => boolean): (value: unknown) => boolean {
  return (value) => Array.isArray(value) && value.every(guard);
}

export function isOneOf(...allowed: string[]): (value: unknown) => boolean {
  return (value) => typeof value === 'string' && allowed.includes(value);
}

export function nullable(guard: (value: unknown) => boolean): (value: unknown) => boolean {
  return (value) => value === null || guard(value);
}

export const isString: Guard<string> = (value): value is string => typeof value === 'string';
export const isNumber: Guard<number> = (value): value is number => typeof value === 'number' && Number.isFinite(value);
