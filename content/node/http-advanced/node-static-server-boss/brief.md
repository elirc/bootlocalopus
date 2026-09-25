**Boss: a static file server.** `express.static` and nginx do a lot for you,
and one day you will need to do it yourself — serving uploads from a volume,
reports from a job, a docs site from a build folder. This handler brings the
whole chapter together, and every piece has a way to fail in production:

- a path check that `/%2e%2e/` or `..\` slips past, or a sibling folder called
  `public-old` that passes `startsWith(root)`;
- a conditional request that never answers `304`;
- a range served off by one, or gzip applied to a range;
- `Content-Length` of the file on a compressed response;
- a missing `Vary` that lets a cache hand gzip to a client that cannot read it.

## Task

Export `createStaticHandler({ root })` returning a `(req, res)` handler that
serves files under the directory `root`, streamed from disk.

**Routing and safety**

1. Only `GET` and `HEAD`; anything else → `405` with `allow: GET, HEAD`.
2. Take the pathname (ignore the query) and percent-decode it. A malformed
   encoding (`decodeURIComponent` throws) or a NUL character → `400`.
3. Resolve it inside `root`. If the result is not `root` itself or inside it
   (compare with `path.relative`, or `startsWith(root + path.sep)` — never a
   bare `startsWith(root)`), → `404`. Both `/` and `\` count as separators.
4. A directory serves its `index.html`; a missing file, a directory without
   `index.html`, or anything that is not a regular file → `404`.

Error responses have `content-type: text/plain; charset=utf-8` and a short
body of your choice.

**Headers on every file response** (`200`, `206`, `304`, `416`)

- `content-type` by extension (case-insensitive): `.html` →
  `text/html; charset=utf-8`, `.css` → `text/css; charset=utf-8`, `.js` →
  `text/javascript; charset=utf-8`, `.json` → `application/json`, `.txt` →
  `text/plain; charset=utf-8`, `.svg` → `image/svg+xml`, `.png` → `image/png`,
  anything else → `application/octet-stream`;
- `etag`: `"<size in hex>-<Math.floor(mtimeMs) in hex>"`;
- `last-modified`: the mtime as an HTTP date (`toUTCString()`);
- `accept-ranges: bytes`;
- `vary: Accept-Encoding` when the type is **compressible**: `text/*`,
  `application/json` or `image/svg+xml`.

**Decisions, in this order**

1. **304** — if `If-None-Match` is present: `*` or any listed tag equal to
   the ETag ignoring `W/` → `304`. Otherwise, if it is absent and
   `If-Modified-Since` is a valid date: mtime truncated to whole seconds
   `<=` that date → `304`. A `304` has no body.
2. **Range** — as in the range lesson: a single `bytes=` range (`a-b`, `a-`,
   `-n`), ignored if malformed or multiple, or if `If-Range` is present and
   not exactly the ETag. Satisfiable → `206` with
   `content-range: bytes <start>-<end>/<size>`, `content-length` and those bytes
   (`createReadStream(file, { start, end })` — `end` is inclusive there too).
   Unsatisfiable → `416` with `content-range: bytes */<size>`. **Ranges are
   never compressed.**
3. **gzip** — otherwise, if the type is compressible, the file is at least
   **1024 bytes**, and `Accept-Encoding` lists `gzip` (or `*`) with a quality
   above 0 (explicit `gzip;q=0` wins over `*`): `200` with
   `content-encoding: gzip`, the ETag sent as a weak ETag (`W/"…"`, since the
   bytes differ), **no** `content-length`, and the file piped through
   `createGzip()`.
4. Otherwise `200` with `content-length` and the file.

`HEAD` returns the same status and headers as `GET` with no body.
