A 400 KB JSON response compresses to 40 KB; on a phone that is the
difference between a snappy page and a spinner. Response compression is
usually one line of middleware — and the bugs are all in what that line
does not think about:

- **The cache key.** A CDN caches the gzip response and serves it to a client
  that never said it accepts gzip. `Vary: Accept-Encoding` tells every cache
  that the response depends on that request header. And when another
  middleware already set `Vary: Origin`, **overwriting** it breaks CORS
  caching instead — `Vary` must be **merged**.
- **`q=0`.** `Accept-Encoding: gzip;q=0, *` means "anything **but** gzip".
- **Wasted work.** Compressing a 200-byte body makes it bigger; compressing a
  JPEG or a zip burns CPU for nothing.
- **`Content-Length`.** It must be the length of the bytes actually sent —
  the compressed ones.

## Task

**`pickEncoding(header)`** returns `'br'`, `'gzip'` or `'identity'`:

- Missing or blank header → `'identity'`.
- The header is a comma-separated list of `coding` or `coding;q=<n>` (trim
  spaces, case-insensitive codings; `q` defaults to `1`). The quality of `br`
  and of `gzip` is that of their own entry if present, otherwise that of a `*`
  entry if present, otherwise `0`.
- Pick whichever of `br` and `gzip` has the higher quality **above 0**,
  preferring `br` on a tie; if neither is above 0, `'identity'`.

**`async function sendCompressed(req, res, { status = 200, type, body })`** —
`body` is a string or Buffer. It writes the complete response:

- Always set `content-type: <type>`, and **add** `Accept-Encoding` to the
  response's `Vary` header: if `res` already has a `vary` header, append
  `, Accept-Encoding` unless it is already listed (case-insensitive); otherwise
  set it to `Accept-Encoding`.
- Compress with the picked encoding **only if** the body is at least
  **1024 bytes** and `type` is compressible. Not compressible: types starting
  with `image/` (except `image/svg+xml`), `video/` or `audio/`, and
  `application/zip`, `application/gzip`. Compare the type without any
  `;charset=…` parameter.
- When compressing: `content-encoding: br` or `gzip`, the compressed bytes as
  the body, and `content-length` of the **compressed** bytes. Otherwise send
  the body as is with its own byte length and no `content-encoding`.

Use `promisify` from `node:util` with `gzip` and `brotliCompress` from
`node:zlib`.
