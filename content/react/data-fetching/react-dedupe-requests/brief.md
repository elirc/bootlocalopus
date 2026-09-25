A comment thread renders a `UserBadge` next to each of forty comments. Each
badge fetches its author. The network tab shows forty requests, thirty-six of
them for the same three users, all in flight at once. Development makes it
worse: StrictMode mounts every effect twice.

The fix is **request deduplication**: while a request for a key is in flight,
anyone else asking for that key gets the **same promise** instead of a new
request. It is not a cache. Once the request settles, the next caller starts
a fresh one, so errors are not remembered and data is never older than one
request.

Two classic mistakes:

- **Never removing the entry.** The in-flight map quietly becomes a
  permanent cache, and a failed request is "cached" too: every later caller
  gets the same rejection forever.
- **Removing it with `promise.finally(...)`.** `finally` returns a *new*
  promise that rejects when the original does, and nobody handles that one:
  every failed request now also logs an unhandled rejection. Use
  `promise.then(clear, clear)`.

## Task

1. Export `createRequestClient()` returning `{ fetch(key, fn) }`:
   - `fetch` calls `fn()` and returns its promise, unless a request for `key`
     is already in flight, in which case it returns **that same promise
     object** and does not call `fn`.
   - when the request settles, successfully or not, the key is no longer in
     flight.
   - if `fn` throws synchronously, `fetch` returns a rejected promise, and the
     key is not left in flight.
   - different keys never share a request; different clients never share
     anything.

2. Export `useDedupedQuery(client, key, fetcher)` returning
   `{ status, data, error }` (`'loading'` with `data: undefined`,
   `'success'`, or `'error'`; `error` is `null` unless `status` is
   `'error'`). It requests through `client.fetch(key, () => fetcher(key))`
   on mount and on every key change, shows `loading` immediately for a new
   key, and ignores responses for a key it no longer shows. A new `fetcher`
   identity must not refetch.

3. Export `UserBadge({ client, userId, fetchUser })` rendering
   `<span>Loading…</span>`, `<span>{user.name}</span>`, or
   `<span>Unknown user</span>` on error.
