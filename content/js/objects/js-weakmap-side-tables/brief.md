You need to remember something *about* an object you do not own: a computed
summary of a state object, a stable key for an item from an API that has no
id, a "seen" flag on a request. There are two tempting ways to do it, and both
are bugs:

- **Stash it on the object** (`obj.__summary = …`). That changes other
  people's data, shows up in `Object.keys` and `JSON.stringify`, and throws a
  `TypeError` in strict mode (every ES module) when the object is frozen —
  as Redux and Immer state is.
- **Key a `Map` by the object.** The `Map` holds a strong reference, so every
  object you ever looked at stays in memory forever. That is a slow leak
  that shows up as a heap graph climbing over a week.

A `WeakMap` is a side table: keyed by object identity, invisible to the
object, and it does not keep its keys alive. When nothing else references
the object, its entry disappears with it.

## Task

Export two functions.

### `weakMemo(fn)`

Returns `memo(arg)`, a one-argument memoised version of `fn`:

- When `arg` is an object or a function, `fn(arg)` runs **once per
  identity**; later calls with the same object return the cached result, even
  when that result is `undefined`. Two different objects with equal contents
  are different keys.
- When `arg` is a primitive, `fn(arg)` is called every time (a `WeakMap`
  cannot hold primitives, and a `Map` would grow forever). It must not throw.
- `memo.has(obj)` — whether a result is cached for `obj`.
- `memo.forget(obj)` — drops the cached result so the next call recomputes.
- It never adds, changes or removes a property on `arg`, and works on frozen
  objects.

### `createIdentityKeys()`

Returns `keyOf(obj)`, which gives every object a stable string key for
things like React list keys when the data has no id:

- The first object seen gets `'k1'`, the next new object `'k2'`, and so on.
  The same object always gets the same key.
- Each `createIdentityKeys()` call has its own counter.
- `keyOf` of a primitive throws a `TypeError`.
- Like `weakMemo`, it never touches the object and works on frozen objects.
