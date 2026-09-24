export function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

export function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  const wrapped = function (...args) {
    const key = keyFn.apply(this, args);
    if (!cache.has(key)) cache.set(key, fn.apply(this, args));
    return cache.get(key);
  };
  wrapped.cache = cache;
  return wrapped;
}
