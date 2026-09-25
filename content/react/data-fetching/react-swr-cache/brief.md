The fetch-in-an-effect component works, and users still hate it: every time
they click between two customers, the panel flashes "Loading…" and refetches
data they saw five seconds ago. The fix everyone ships next is
**stale-while-revalidate**: keep responses in a cache keyed by the request,
show the cached data **immediately**, and refetch in the background to
replace it if it changed.

Getting it right is mostly about keys:

- switching key must never show the **previous key's data** for the new key,
  not even for one frame (an effect that "resets" state runs after that
  frame has been painted);
- a slow response for an old key must not land in the view for the new key,
  but it is still a **valid response for its own key**, so it belongs in the
  cache;
- a failed background refresh should not wipe data the user can already see.

## Task

Export `createCache()`, returning a new, empty `Map` (key to data), and
`useCachedQuery(cache, key, fetcher)` returning
`{ status, data, error, isFetching }`, where `key` is a string and
`fetcher(key)` returns a promise.

- On every mount and every key change, call `fetcher(key)` once.
- With **no** cached data for `key`: `status: 'loading'`, `data: undefined`,
  `isFetching: true`.
- With cached data: `status: 'success'` and that `data` **on the very first
  render** for that key, `isFetching: true` while the refetch runs.
- On success: store the data in the cache under its key (even if the
  component has moved on to another key), and, if the component still shows
  that key, `status: 'success'`, the new `data`, `error: null`,
  `isFetching: false`.
- On failure, if the component still shows that key: with data on screen,
  keep `status: 'success'` and the data, set `error`, `isFetching: false`;
  with no data, `status: 'error'`, `data: undefined`, `error`,
  `isFetching: false`.
- `error` is `null` whenever the last completed request succeeded. When the
  key changes, `error` resets to `null`.
- `fetcher` is usually an inline arrow: a new identity must not refetch.

Then export `CustomerPanel({ cache, id, fetchCustomer })` rendering:

- `<p>Loading…</p>` while loading with nothing to show
- `<h2>{data.name}</h2>` when there is data, plus `<p>Refreshing…</p>` while
  `isFetching`
- `<p role="alert">Could not load customer</p>` on `status: 'error'`
