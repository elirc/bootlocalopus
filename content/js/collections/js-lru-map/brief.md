An unbounded cache is a memory leak with good intentions: the `Map` that
memoises "user by id" holds every user who ever logged in until the process
dies. The fix is a bound and an eviction policy, and the policy you want nine
times out of ten is **least recently used**: when the cache is full, drop the
entry nobody has touched for longest.

You do not need a linked list for it. A `Map` iterates in **insertion order**,
so if every "use" deletes the key and sets it again, the first key in the map is
always the least recently used one, and `map.keys().next().value` finds it in
O(1).

The bugs are all in the edges:

- **Overwriting a key in a full cache evicts something.** Setting a key that
  is already there must not push anything out.
- **`undefined` is a value.** `if (map.get(key))` or `!== undefined` checks
  treat a cached `undefined`, `0` or `""` as a miss: the entry is never
  refreshed, and later evicted while still hot.
- **Looking is not using.** A monitoring loop that calls `has()` over every key
  must not reshuffle the eviction order.

## Task

Export a class `LruCache`:

- `new LruCache({ max, onEvict })` — `max` must be a positive integer, or throw
  a `RangeError`. `onEvict(key, value)` is optional.
- `get(key)` — the value, or `undefined` if absent. A hit makes the key the
  **most** recently used.
- `set(key, value)` — insert or overwrite, making the key the most recently
  used; returns the cache (so calls can chain). If that pushes the size above
  `max`, evict the least recently used entry and call `onEvict(key, value)`
  with it. `onEvict` is called **only** for capacity evictions — not for
  `delete`, and not for an overwrite.
- `has(key)` and `peek(key)` — like `get`'s presence check and value, but
  **without** changing the order.
- `delete(key)` — remove; returns `true` if the key was there.
- `get size` — the number of entries.
- `keys()` — an **array** of keys from least to most recently used.

Keys can be any value, compared the way a `Map` compares them (so objects by
identity, and `NaN` is a valid key). Stored values can be anything, including
`undefined`.
