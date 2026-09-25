const INTEGER_LITERAL = /^-?[0-9]+$/;
const ID = /^[0-9]+$/;

export function parseJson(text) {
  return JSON.parse(text, (key, value, context) => {
    // `context.source` is the literal as written in the text — before it was rounded to a Number.
    if (typeof value === 'number' && !Number.isSafeInteger(value) && INTEGER_LITERAL.test(context?.source ?? '')) {
      return BigInt(context.source);
    }
    return value;
  });
}

export function stringifyJson(value) {
  // rawJSON output is emitted verbatim, so the BigInt becomes an unquoted number.
  return JSON.stringify(value, (key, v) => (typeof v === 'bigint' ? JSON.rawJSON(v.toString()) : v));
}

export function compareIds(a, b) {
  if (typeof a !== 'string' || !ID.test(a)) throw new TypeError(`not an id: ${a}`);
  if (typeof b !== 'string' || !ID.test(b)) throw new TypeError(`not an id: ${b}`);
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
