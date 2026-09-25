const isObjectLike = (value) =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

export function weakMemo(fn) {
  const cache = new WeakMap();

  function memo(arg) {
    if (!isObjectLike(arg)) return fn(arg); // cannot be a WeakMap key: no caching
    // has(), not get() !== undefined: an undefined result is still a result.
    if (!cache.has(arg)) cache.set(arg, fn(arg));
    return cache.get(arg);
  }

  memo.has = (arg) => isObjectLike(arg) && cache.has(arg);
  memo.forget = (arg) => {
    if (isObjectLike(arg)) cache.delete(arg);
  };
  return memo;
}

export function createIdentityKeys() {
  const keys = new WeakMap();
  let next = 1;

  return function keyOf(obj) {
    if (!isObjectLike(obj)) {
      throw new TypeError(`keyOf expects an object, got ${obj === null ? 'null' : typeof obj}`);
    }
    let key = keys.get(obj);
    if (key === undefined) {
      key = `k${next++}`;
      keys.set(obj, key);
    }
    return key;
  };
}
