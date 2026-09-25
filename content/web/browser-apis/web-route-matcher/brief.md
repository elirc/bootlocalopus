A client-side router is a list of patterns and one question: which route is
this URL? The naive answer — the first pattern that matches — breaks the
moment someone reorders the list: `/products/:id` declared above
`/products/new` sends the "new product" page to a product called `new`.
The other classic bugs are all in the edges: a trailing slash that 404s, a
param left percent-encoded (`caf%C3%A9`), a malformed `%` that throws
`URIError` and crashes the whole app, and links built by concatenating ids
that contain `/`.

## Task

Export `createRouter(routes)`. `routes` is an array of `{ name, path }`.
A `path` is `/`-separated segments, each one of:

- a **static** segment, matched exactly (case-sensitive; characters like `.`
  are literal);
- `:param` — matches one **non-empty** segment;
- `*` — only as the **last** segment: matches the rest of the path, zero or
  more segments.

It returns `{ match(href), href(name, params) }`.

### `match(href)`

`href` is a path, optionally with a query string and a hash
(`/products/42?tab=reviews#top`). Return `{ name, params, query }` or `null`.

- Leading and trailing slashes are ignored: `/products/42/` matches
  `/products/:id`, and `/` matches the pattern `/`. An empty segment in the
  middle (`/products//42`) matches nothing.
- `params` holds each `:param` **decoded** with `decodeURIComponent`, and for
  `*` a `'*'` key with the rest of the path (each segment decoded, joined with
  `/`; `''` when nothing is left). If decoding throws, that route does not
  match — never throw.
- `query` is a plain object of the query string (last value wins for a
  repeated key).
- **The most specific route wins, whatever the declaration order.** Compare
  two matching routes segment by segment from the left: at the first position
  where they differ, static beats `:param`, and `:param` beats `*`
  (`/docs/:page` beats `/docs/*` for `/docs/intro`). A pattern that has
  already ended beats a `*` that matched nothing (`/docs/:page` beats
  `/docs/:page/*` for `/docs/intro`). Between routes of identical shape, the
  one declared first wins.

### `href(name, params = {})`

Builds the path for a route: `/` plus the segments joined with `/`, with each
`:param` replaced by `encodeURIComponent(String(value))` and `*` by the
`'*'` param with each of its `/`-separated parts encoded (`''` when absent).
`href('home')` for the path `/` is `'/'`.

Throw an `Error` for an unknown route name, or a missing (`undefined` or
`null`) or empty `:param`. Whatever the params contain — `/`, `?`, `#`, `%`,
spaces, accents — `match(href(name, params))` gives back the same params (as
strings), unless a more specific route claims that path.
