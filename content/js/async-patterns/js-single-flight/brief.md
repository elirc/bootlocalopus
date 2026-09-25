A popular product page's cache entry expires. In the next 50 ms, 400 requests
miss the cache and all 400 run the same expensive query — a **cache
stampede**, and the database falls over exactly when traffic peaks. The same
bug on the frontend: five components mount, each calls `getCurrentUser()`,
five identical requests go out.

The fix is to **coalesce** concurrent calls: while a call for a key is in
flight, everyone else asking for that key gets the *same* promise. Once it
settles, the key is forgotten. This is not a cache — it never serves a result
after the call finished, and above all it must never remember a **failure**,
or one transient error is served to everyone forever.

Two traps:

- `promise.finally(cleanup)` returns a **new** promise. If the original
  rejects, that new one rejects too, and nobody is listening: an unhandled
  rejection. Clean up in a way that does not create an orphan promise.
- `forget(key)` lets a caller force a fresh call while an old one is still
  running. When the old one finally settles, its cleanup must not delete the
  **new** call's entry.

## Task

Export a class `SingleFlight`:

- `run(key, fn)` — if a call for `key` is in flight, return **the same
  promise** and do not call `fn`. Otherwise call `fn()` and return a promise
  of its result. A synchronous throw from `fn` becomes a rejection.
- When that call settles — fulfilled or rejected — the key is removed, so the
  next `run` with it calls its `fn` again.
- `forget(key)` — drop the in-flight entry so the next `run(key, …)` starts a
  new call. Callers already waiting on the old promise still get its result.
- `get size` — the number of keys currently in flight.
