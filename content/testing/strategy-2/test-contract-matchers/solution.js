const MATCHER = Symbol('matcher');

/** Any value of the same type as `example` (applies to everything nested inside it). */
export const like = (example) => ({ [MATCHER]: 'like', example });

/** An array with at least `min` items, each of the same shape and types as `example`. */
export const eachLike = (example, { min = 1 } = {}) => ({ [MATCHER]: 'eachLike', example, min });

/** A string matching `regex`. `example` is what a mock provider would return. */
export const term = (regex, example) => ({ [MATCHER]: 'term', regex, example });

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const show = (v) => JSON.stringify(v);

/**
 * Checks a provider's `actual` response body against the consumer's
 * `contract`. Returns every mismatch as a string, or [] when it satisfies
 * the contract.
 */
export function verify(contract, actual) {
  const problems = [];
  check(contract, actual, '$', false, problems);
  return problems;
}

/** `byType`: inside `like`/`eachLike`, literals match any value of the same type. */
function check(expected, actual, path, byType, problems) {
  const kind = expected !== null && typeof expected === 'object' ? expected[MATCHER] : undefined;

  if (kind === 'like') return check(expected.example, actual, path, true, problems);

  if (kind === 'term') {
    if (typeof actual !== 'string') return problems.push(`${path}: expected string, got ${typeOf(actual)}`);
    if (!expected.regex.test(actual)) problems.push(`${path}: ${show(actual)} does not match ${expected.regex}`);
    return;
  }

  if (kind === 'eachLike') {
    if (!Array.isArray(actual)) return problems.push(`${path}: expected array, got ${typeOf(actual)}`);
    if (actual.length < expected.min) {
      return problems.push(`${path}: expected at least ${expected.min} item(s), got ${actual.length}`);
    }
    actual.forEach((item, i) => check(expected.example, item, `${path}[${i}]`, true, problems));
    return;
  }

  const want = typeOf(expected);
  const got = typeOf(actual);
  if (want !== got) return problems.push(`${path}: expected ${want}, got ${got}`);

  if (want === 'array') {
    if (actual.length !== expected.length) {
      return problems.push(`${path}: expected ${expected.length} item(s), got ${actual.length}`);
    }
    expected.forEach((item, i) => check(item, actual[i], `${path}[${i}]`, byType, problems));
    return;
  }

  if (want === 'object') {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) problems.push(`${path}.${key}: missing`);
      else check(expected[key], actual[key], `${path}.${key}`, byType, problems);
    }
    return; // extra keys in `actual` are fine: consumers ignore what they do not read
  }

  if (!byType && actual !== expected) problems.push(`${path}: expected ${show(expected)}, got ${show(actual)}`);
}
