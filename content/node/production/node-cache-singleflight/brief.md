A cache in front of a slow call looks like five lines: check a `Map`, else
`await load()` and store it. Then the entry expires at 09:00:00 on a busy
morning, and the two hundred requests that arrive in the next 300 ms **all**
miss, and all two hundred hit the database at once. That is a cache stampede,
and it takes down the thing the cache was protecting.

The fix is **single-flight**: cache the *promise* of an in-flight load, so
every concurrent miss for a key waits on one call. Three details make it
correct rather than merely fast:

- A **rejected** load must not be cached, or one blip becomes a cached error
  for the whole TTL.
- The cache must be **bounded**, or it is a memory leak with extra steps.
- **Invalidation during a load** — `delete(key)` while the old value is still
  being fetched — must not let that stale result land in the cache afterwards.

## Task

Export `createCache({ max = 100, ttlMs = 60_000, now = Date.now } = {})`
returning:

- **`getOrLoad(key, loader)`** → always a Promise (even if `loader` throws
  synchronously).
  - A **fresh** cached entry resolves its value without calling `loader`.
    `undefined`, `null` and `0` are values like any other.
  - On a miss, call `loader(key)` **once**. Every `getOrLoad` for that key
    while it is pending gets the same outcome — no second call.
  - When the load resolves, store the value with a timestamp of `now()` **at
    that moment**. An entry is stale once `now() - storedAt >= ttlMs`, and a
    stale entry is a miss.
  - When the load rejects (or `loader` throws), every waiter rejects with that
    error, nothing is stored, and the next `getOrLoad` calls the loader again.
- **LRU eviction**: at most `max` stored entries. When storing would exceed
  it, evict the **least recently used** — where both storing an entry and a
  fresh hit on it count as a use.
- **`delete(key)`** removes the stored entry. If a load for that key is in
  flight, its waiters still get its result, but that result is **not** stored,
  and the next `getOrLoad(key)` starts a new load instead of joining the old one.
- **`size`** (a getter): the number of stored entries. Pending loads do not count.

Everything is in memory and timer-free: time comes only from `now()`.
