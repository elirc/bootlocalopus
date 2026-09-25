Every lesson in this chapter solved one fetching problem in one component.
Real apps need them solved **once**, for every component, which is what
TanStack Query, SWR and RTK Query are. This boss builds the core of one, so
that next time the library does something surprising you know why.

The ideas, all from earlier lessons, now shared across components:

- **one cache entry per key**, compared by value (`['todo', 1]` and
  `['todo', 1]` are the same query; `['todo', '1']` is not), and every
  component using that key sees the same state and shares one request;
- **stale-while-revalidate** with a `staleTime`: fresh data is served without
  a request, stale data is shown immediately and refetched in the background;
- **invalidation by prefix** after a mutation, and **latest request wins**;
- **refetch on window focus**, the feature users notice most.

The tests inject the clock: `createQueryClient({ now })`. Use `now()` for
every time comparison, never `Date.now()` directly.

## Task

**`createQueryClient({ now = () => Date.now() } = {})`** returns a client
with:

- `getQueryData(key)`: the cached data, or `undefined`.
- `setQueryData(key, dataOrUpdater)`: sets the data (an updater receives the
  old data), counts as fresh as of `now()`, sets `status: 'success'`,
  `error: null`, `isFetching: false`, and updates every subscriber. A
  response already in flight for that key must not overwrite it.
- `invalidateQueries(prefix)`: every query whose key **starts with** the
  `prefix` array (element-wise, compared by value) becomes stale. Those with
  mounted subscribers refetch **right away**, even if a request is already in
  flight; the others refetch on their next mount.

**`QueryClientProvider({ client, children })`** makes the client available,
and while mounted, a `focus` event on `window` refetches every query that
has subscribers and is stale (per its subscribers' smallest `staleTime`) and
not already fetching.

**`useQueryClient()`** returns the client, or throws
`Error('useQueryClient must be used within a QueryClientProvider')`.

**`useQuery(key, fetcher, { staleTime = 0, enabled = true } = {})`** returns
`{ status, data, error, isFetching, refetch }`:

- `status` is `'loading'` until the key has data, then `'success'`; it is
  `'error'` only when a request failed and there is no data. `error` is the
  last failure, or `null` after a success. `isFetching` is `true` while a
  request for the key is in flight.
- On mount and on key change (when `enabled`): if the key's data is missing,
  invalidated, or older than `staleTime` ms, fetch it, unless a request for
  it is already in flight. Otherwise do nothing.
- The first render for a new key shows **that** key's state, never the
  previous key's data.
- Only the most recently started request for a key may update it.
- `fetcher()` takes no arguments and may be a new inline function every
  render; that must not refetch. The latest one is used.
- `enabled: false` never fetches (dependent queries: a key with a `null` id).
- `refetch()` always starts a new request.
- An unmounted component stops being a subscriber.
