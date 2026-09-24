export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });

export function attempt(fn) {
  // TODO
}

export async function attemptAsync(fn) {
  // TODO
}

export function map(result, fn) {
  // TODO
}

export function mapError(result, fn) {
  // TODO
}

export function unwrapOr(result, fallback) {
  // TODO
}

export function unwrap(result) {
  // TODO
}

export function all(results) {
  // TODO
}
