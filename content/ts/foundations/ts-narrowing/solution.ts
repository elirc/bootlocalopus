export interface User {
  id: string;
  name: string;
}

// TypeScript >= 5.5 infers `value is string` here; the annotation is optional.
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

// Inference would only produce `object & Record<'id', unknown> & ...`.
// Saying `value is User` is the point: this guard is the boundary.
export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'name' in value && typeof value.name === 'string'
  );
}

export function isNonNull<T>(value: T | null | undefined): value is T {
  return value != null;
}

export function hasKey<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

export function describe(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'string') return 'string: ' + value;
  if (typeof value === 'number') return 'number: ' + value;
  if (Array.isArray(value)) return 'array of ' + value.length;
  if (typeof value === 'object') return 'object';
  return typeof value;
}
