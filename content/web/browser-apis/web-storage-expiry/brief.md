`localStorage` looks like a `Map` and is not one:

- It has **no expiry**. A "remember my filters for a day" feature keeps them
  for three years.
- It only stores **strings**, and whatever is in it survives deploys. A value
  written by last year's code, a browser extension or a half-finished write
  is still there, and `JSON.parse` throws on it — at startup, on every load.
- It is **small** (about 5 MB per origin) and `setItem` **throws**
  `QuotaExceededError` when it is full (Firefox calls it
  `NS_ERROR_DOM_QUOTA_REACHED`). An uncaught throw in a "save draft" handler
  loses the draft.
- It is shared by every script on the origin, so a cleanup that removes keys
  it does not own breaks other features.

## Task

Export `createStore({ storage, prefix, now = Date.now })`. `storage` has the
`Storage` interface (`getItem`, `setItem`, `removeItem`, `key(i)`, `length`).
Every key this store writes is `prefix + key`; it must **never** read, write
or remove keys without that prefix. How you encode an entry (value plus
expiry) inside the string is up to you.

It returns:

- `set(key, value, { ttlMs } = {})` — stores any JSON-serialisable `value`,
  expiring `ttlMs` milliseconds from `now()`; without `ttlMs` it never
  expires. Returns `true` when stored.
  - If `setItem` throws a quota error (an error whose `name` is
    `QuotaExceededError` or `NS_ERROR_DOM_QUOTA_REACHED`), call
    `clearExpired()` and try **once** more. If that also hits the quota,
    return `false`. Any other error is rethrown.
- `get(key)` — the stored value, or `null` when the key is missing, expired
  or **unreadable** (not something this store wrote, e.g. `not json{`).
  Expired and unreadable entries are removed as a side effect. An entry is
  expired when `now() >= expiresAt`.
- `remove(key)`.
- `clearExpired()` — removes every expired or unreadable entry **under the
  prefix** and returns how many it removed.

Watch out in `clearExpired`: `storage.key(i)` is index-based, so removing
entries while looping over the indexes skips the entry after each one you
remove. Collect the keys first.
