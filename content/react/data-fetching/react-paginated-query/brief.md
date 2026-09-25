Paginated tables built on fetch-in-an-effect do this on every click of
"Next": the rows vanish, a spinner appears, the table height collapses, the
"Next" button jumps up under the cursor, and the rows come back. Clicking
"Previous" fetches a page the user saw three seconds ago.

What users expect, and what query libraries call *placeholder data* and
*prefetching*:

- while the next page loads, **keep showing the current page** (dimmed or
  marked busy) instead of an empty spinner;
- pages already seen come back **instantly** from a cache;
- the page after the current one is **prefetched** in the background, so
  "Next" is usually instant too;
- rapid clicks never show a page the user has already moved past;
- a prefetch still in flight when the user clicks "Next" is **joined**, not
  duplicated.

## Task

Export `usePagedData(page, fetchPage)`, where `fetchPage(page)` returns a
promise for `{ items, hasMore }`, returning
`{ data, isPlaceholder, isFetching, error }`. Each hook instance has its own
cache of loaded pages.

- When `page` is cached: `data` is that page, `isPlaceholder: false`,
  `isFetching: false`. Cached pages are not fetched again.
- When it is not: fetch it. Meanwhile `data` is the **last page that was
  shown** (with `isPlaceholder: true`), or `undefined` if none was, and
  `isFetching: true`.
- Only one request per page at a time: if a request for that page (a
  prefetch, for instance) is already in flight, wait for it.
- Every successful response is cached, including one for a page the user has
  already left, but only the current page is ever shown.
- After the current page is available (from the cache or the network) and
  its `hasMore` is true, prefetch `page + 1` unless it is cached or in
  flight. A failed prefetch is forgotten: visiting that page fetches it
  again.
- If the current page fails: `error` is what it rejected with,
  `isFetching: false`, and `data` stays the placeholder. `error` is `null`
  otherwise.
- `fetchPage` may be an inline arrow.

Then export `OrdersTable({ fetchPage })`, starting at page 1:

- `<p>Page {page}</p>`
- `<p>Loading…</p>` only while there is no data at all
- `<p role="alert">Could not load page {page}</p>` on error
- when there is data, `<ul aria-busy={isPlaceholder}>` with one
  `<li>{order.id}</li>` per item
- `Previous` (disabled on page 1) and `Next` (disabled while showing a
  placeholder or when the shown page has no `hasMore`)
