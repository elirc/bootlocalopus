The browser's HTTP cache is invisible until you need to reproduce it: in a
service worker, in a React Native app, in a Node BFF calling another API.
Getting it right is mostly about **two different questions**:

1. **Is my copy still fresh?** `Cache-Control: max-age=60` means "use it for
   60 seconds without asking". No request at all.
2. **Is my stale copy still valid?** Send `If-None-Match: <etag>`. A `304 Not
   Modified` has no body and means "yes, keep using it".

The classic client bug is checking `response.ok` first: a `304` is **not**
`ok` (it is not 2xx), so the wrapper throws exactly when the cache worked.
The other classics: handing out the cached object itself, so one caller's
`result.items.push(...)` corrupts everyone's copy; and firing five identical
requests because five components mounted at once.

## Task

Export `HttpError` (extends `Error`, `name` `'HttpError'`, property `status`)
and `createHttpCache({ fetch, now = Date.now })` returning `{ get(url) }`.
`get` resolves to the parsed JSON body. The grader's `fetch` returns real
`Response` objects and records the headers you sent.

**Reading `Cache-Control`** (response header, may be absent): directives are
comma-separated, trimmed, case-insensitive. `max-age=N` gives `N` seconds.

**Storing**, on a `200`:

- `no-store` → do **not** store, and delete any entry already stored for the URL.
- otherwise store `{ data, etag, freshUntil }` when the response has an `ETag`
  or a `max-age` greater than 0; `freshUntil` is `now() + N * 1000` when there
  is a `max-age` and no `no-cache` directive, else `0` (always revalidate).
- a `200` with neither → delete any entry for the URL.

**Getting**:

1. An entry with `now() < freshUntil` → return it **without calling `fetch`**.
2. Otherwise call `fetch(url, { headers })`, where `headers` has
   `if-none-match: <etag>` if the stored entry has an ETag (and nothing
   otherwise).
3. `304` → return the stored data, and update `freshUntil` from the 304's own
   `Cache-Control` (same rule as above; a 304 without `max-age` sets it to `0`).
4. `200` → parse, store (see above), return.
5. Any other status → throw `HttpError` with that `status`; keep the entry.
   (A `304` when nothing is stored is also an `HttpError`, status `304`.)

**Always return a fresh copy** (`structuredClone`) of the data, so callers
cannot mutate the cache or each other's results.

**Deduplicate**: while a request for a URL is in flight, other `get(url)`
calls share it instead of calling `fetch` again (each still gets its own
copy). A failed request rejects every waiter and is not remembered.
