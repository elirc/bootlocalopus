export interface User {
  id: string;
  name: string;
}

export function isString(value: unknown) {
  return typeof value === 'string';
}

export function isUser(value: unknown) {
  // TODO: check the shape, and give this a type predicate return type
  return false;
}

export function isNonNull(value: unknown) {
  // TODO: make this generic and predicate-typed
  return value != null;
}

export function hasKey(value: unknown, key: string) {
  // TODO
  return false;
}

export function describe(value: unknown): string {
  // TODO
  return '';
}
