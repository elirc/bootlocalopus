"Load more" looks like `setPage(page + 1)`. Then the bug reports arrive:

- A user double-clicks the button and page 2 appears **twice**. The second
  click ran before React re-rendered, so it saw `loading === false` too. A
  guard that lives in state is always one render late; this one has to be
  synchronous.
- A post is published while the user scrolls, everything shifts by one, and
  the last item of page 2 shows up again at the top of page 3. React warns
  about duplicate keys and the list jumps.
- Page 3 fails and the error handler resets the list, throwing away the two
  pages the user already scrolled through.

## Task

Export `useInfiniteList(fetchPage)`, where `fetchPage(cursor)` returns a
promise for `{ items, nextCursor }`; the first page is requested with
`cursor = null`, and `nextCursor: null` means there are no more pages. Every
item has a unique `id`.

It returns `{ items, isLoading, error, hasMore, loadMore, retry }`:

- fetches the first page on mount; `isLoading` is `true` from the first
  render until it arrives.
- `items` is every loaded page concatenated in order, **skipping any item
  whose `id` has already been loaded**.
- `hasMore` is `true` until a page arrives with `nextCursor === null`.
- `loadMore()` requests the next page, and does nothing while a request is in
  flight, after an error, or when `hasMore` is false. Two calls in the same
  event handler make **one** request.
- a failed page sets `error` (whatever `fetchPage` rejected with) and keeps
  every item already loaded. `retry()` requests the **same** cursor again and
  clears `error`; it does nothing when there is no error.
- `loadMore` and `retry` are stable across renders; `fetchPage` is usually an
  inline arrow and a new identity must change nothing.
- mounting under `<React.StrictMode>` requests the first page **once** (its
  simulated remount must not start a second request).

Then export `Feed({ fetchPage })` rendering:

- a `<ul>` with one `<li>{item.title}</li>` per item
- `<p>Loading…</p>` while loading
- a `Load more` button while `hasMore` and there is no error, `disabled` while
  loading
- on error, `<p role="alert">Could not load more</p>` and a `Try again`
  button
- when there is nothing more, `<p>You're all caught up</p>`
