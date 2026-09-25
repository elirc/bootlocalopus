// These wrappers work at runtime, and erase every type that passes through
// them: whatever you wrap comes back as `(...args: any[]) => any`.

type AnyFn = (...args: any[]) => any;

export function withLogging(name: string, fn: AnyFn, log: (line: string) => void): AnyFn {
  return (...args) => {
    log(`${name}(${args.length} args)`);
    return fn(...args);
  };
}

export function once(fn: AnyFn): AnyFn {
  let cached: { value: unknown } | undefined;
  return (...args) => {
    if (!cached) cached = { value: fn(...args) };
    return cached.value;
  };
}

export function partial(fn: AnyFn, first: unknown): AnyFn {
  return (...rest) => fn(first, ...rest);
}

export function memoizeAsync(fn: AnyFn, key: AnyFn): AnyFn {
  const cache = new Map<string, Promise<unknown>>();
  return (...args) => {
    const k = key(...args);
    let pending = cache.get(k);
    if (!pending) {
      pending = fn(...args) as Promise<unknown>;
      cache.set(k, pending);
      pending.catch(() => cache.delete(k));
    }
    return pending;
  };
}
