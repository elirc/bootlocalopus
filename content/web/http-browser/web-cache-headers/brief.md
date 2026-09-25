Caching headers go wrong in both directions. Too little, and every visit
re-downloads 900 KB of JavaScript that has not changed in a week. Too much,
and after a deploy half your users run the **old** `index.html` that points at
bundles you just deleted — a blank page until they hard-refresh.

The pattern that fixes both is standard:

- **Fingerprinted assets** (`app.3f9a1c2b.js`): the name changes whenever the
  content does, so the file at a name can be cached forever —
  `public, max-age=31536000, immutable`.
- **HTML**: `no-cache`, which does **not** mean "do not cache". It means "you
  may store it, but ask me before every use". With an `ETag`, asking costs a
  `304 Not Modified` and no body.
- **Everything else**: a short lifetime.

An `ETag` is a validator: the browser sends it back as `If-None-Match`, and if
it still matches, the server answers `304` with no body.

## Task

Export `createAssetHandler(assets)` returning a `(req, res)` handler.
`assets` maps a path to `{ body, type }` — `body` is a string or a `Buffer`,
`type` the content type. Look assets up by the **pathname only** (ignore any
query string).

- Method other than `GET`/`HEAD` → `405` with `Allow: GET, HEAD` and an empty body.
- Unknown path → `404`, `content-type: text/plain`, `cache-control: no-store`,
  body `not found`.
- Otherwise the response carries:
  - `content-type`: the asset's `type`;
  - `content-length`: the body's length **in bytes** (`"café"` is 5 bytes);
  - `etag`: a **strong** validator — a double-quoted string (`"…"`, no `W/`)
    derived from a hash of the body, so equal bodies give equal ETags and
    different bodies different ones;
  - `cache-control`, chosen by the pathname:
    - fingerprinted — the file name ends with `.` or `-`, then **8 or more hex
      digits**, then an extension (`app.3f9a1c2b.js`, `index-4f3a9c1e7b.css`) →
      `public, max-age=31536000, immutable`;
    - otherwise a pathname ending in `.html`, or `/` → `no-cache`;
    - otherwise → `public, max-age=3600`.
- `If-None-Match` handling: the header is `*` or a comma-separated list of
  ETags, any of which may be weak (`W/"…"`). Compare ignoring the `W/` prefix.
  On a match (or `*`) answer `304` with **no body**, still sending `etag` and
  `cache-control`.
- `HEAD` gets the same status and headers as `GET` (including
  `content-length`), and no body.
