Two higher-order functions you will reimplement in every codebase that
does not already have them.

## Task

Export both:

- `once(fn)` — calls `fn` at most once. Later calls return the first result
  without calling `fn` again. Arguments of later calls are ignored.
- `memoize(fn, keyFn)` — caches by key. Default key is `JSON.stringify(args)`.
  Expose `.cache` (a `Map`) on the returned function so callers can inspect or
  clear it.

Both must forward `this` correctly, so a memoized method still works when
called as `obj.method()`.