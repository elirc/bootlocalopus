// Keys that reach a prototype instead of an ordinary property.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepMerge(...sources) {
  const result = {};
  for (const source of sources) {
    if (isPlainObject(source)) mergeInto(result, source);
  }
  return result;
}

// `target` is always an object this module created, so writing to it is safe.
function mergeInto(target, source) {
  for (const key of Object.keys(source)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const incoming = source[key];
    if (incoming === undefined) continue;

    if (isPlainObject(incoming)) {
      const existing = Object.hasOwn(target, key) ? target[key] : undefined;
      // Plain objects in the result are always our own copies, so we can merge into one.
      target[key] = mergeInto(isPlainObject(existing) ? existing : {}, incoming);
    } else {
      target[key] = incoming;
    }
  }
  return target;
}
