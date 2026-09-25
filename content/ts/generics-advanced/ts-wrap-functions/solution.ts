// Capture the parameter list as a tuple `A` and the result as `R`. Spreading
// `...args: A` back out keeps names, optional parameters and arity — and lets
// TypeScript carry a generic function's own type parameters through the wrapper.

export function withLogging<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => R,
  log: (line: string) => void,
): (...args: A) => R {
  return (...args) => {
    log(`${name}(${args.length} args)`);
    return fn(...args);
  };
}

export function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let cached: { value: R } | undefined;
  return (...args) => {
    if (!cached) cached = { value: fn(...args) };
    return cached.value;
  };
}

export function partial<F, A extends unknown[], R>(
  fn: (first: F, ...rest: A) => R,
  first: F,
): (...rest: A) => R {
  return (...rest) => fn(first, ...rest);
}

export function memoizeAsync<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  // NoInfer: `fn` alone decides A. Otherwise a key function that ignores the
  // optional parameters would shrink A and drop them from the wrapper.
  key: NoInfer<(...args: A) => string>,
): (...args: A) => Promise<R> {
  const cache = new Map<string, Promise<R>>();
  return (...args) => {
    const k = key(...args);
    let pending = cache.get(k);
    if (!pending) {
      pending = fn(...args);
      cache.set(k, pending);
      // Do not cache failures: the next call should try again.
      pending.catch(() => cache.delete(k));
    }
    return pending;
  };
}
