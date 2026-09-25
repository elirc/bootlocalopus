// Matchers are plain tagged objects. You can use them as they are.
const MATCHER = Symbol('matcher');

/** Any value of the same type as `example` (applies to everything nested inside it). */
export const like = (example) => ({ [MATCHER]: 'like', example });

/** An array with at least `min` items, each of the same shape and types as `example`. */
export const eachLike = (example, { min = 1 } = {}) => ({ [MATCHER]: 'eachLike', example, min });

/** A string matching `regex`. `example` is what a mock provider would return. */
export const term = (regex, example) => ({ [MATCHER]: 'term', regex, example });

/**
 * Checks a provider's `actual` response body against the consumer's
 * `contract`. Returns every mismatch as a string, or [] when it satisfies
 * the contract.
 */
export function verify(contract, actual) {
  return []; // TODO
}
