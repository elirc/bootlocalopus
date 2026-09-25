/** A thrown plain object that still carries a usable message, like `{ message, code }`. */
function hasMessage(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string';
}

/** A readable description of anything, without ever throwing. */
function describe(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    // JSON.stringify returns undefined for undefined, functions and symbols.
    if (json !== undefined) return json;
  } catch {
    // Circular structures and BigInts throw; fall through.
  }
  return String(value);
}

/** Anything that was thrown, as an Error. Real Errors come back untouched. */
export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value, { cause: value });
  if (hasMessage(value)) return new Error(value.message, { cause: value });
  return new Error(`Non-error thrown: ${describe(value)}`, { cause: value });
}

export function errorMessage(value: unknown): string {
  return toError(value).message;
}

/** Adds context to a failure without losing the original, which stays reachable as `cause`. */
export function wrapError(context: string, value: unknown): Error {
  return new Error(`${context}: ${errorMessage(value)}`, { cause: value });
}
