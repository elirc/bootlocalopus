// The code this replaces did `catch (e) { log((e as Error).message) }`.
// That compiles, and logs `undefined` (or crashes) the first time a library throws a string.

export function toError(value: unknown): Error {
  // TODO
  return value as Error;
}

export function errorMessage(value: unknown): string {
  // TODO
  return (value as Error).message;
}

export function wrapError(context: string, value: unknown): Error {
  // TODO
  throw new Error('not implemented');
}
