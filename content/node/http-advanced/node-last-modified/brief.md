`Last-Modified` looks like the easy validator: send the row's `updated_at`,
and when the client sends it back as `If-Modified-Since`, answer `304 Not
Modified` with no body. The first implementation never returns a single 304,
and nobody notices for a year, because nothing breaks — every request is
just a full download.

The reason: **HTTP dates have one-second precision**. Your `updated_at` is
`12:00:00.734`; the header says `12:00:00`; the client echoes `12:00:00`; and
`updatedAt > ifModifiedSince` is true forever. Compare at the precision the
header has.

Three more rules from the HTTP spec (RFC 9110) that implementations skip:

- When the request has **`If-None-Match`**, the server **ignores**
  `If-Modified-Since` entirely: the ETag is the stronger validator.
- An `If-Modified-Since` that is **not a valid date**, or is **later than the
  server's current time**, is ignored (a client cannot vouch for a future it
  has not seen).
- Conditional requests only apply to **`GET` and `HEAD`**.

## Task

Export `createDocHandler(store, { now = Date.now } = {})`. `store.get(id)`
returns `{ body, updatedAt }` (`body` a string, `updatedAt` a `Date`) or
`undefined`. The handler serves `GET` and `HEAD` on `/docs/<id>`:

- Unknown id → `404` `{"error":"not found"}`. Other methods on an existing
  path → `405` with `allow: GET, HEAD`. Other paths → `404`.
- Validators, sent on every `200` **and** `304`:
  - `last-modified`: `updatedAt` as an HTTP date (`date.toUTCString()` gives
    exactly that format, and drops the milliseconds);
  - `etag`: a strong ETag, `"` + a hash of the body + `"`.
- Decide `304` versus `200`:
  1. If `If-None-Match` is present: `304` if it is `*` or any listed tag
     matches the current ETag (compare ignoring a `W/` prefix); otherwise
     `200`. Do not look at `If-Modified-Since`.
  2. Else, if `If-Modified-Since` is a valid date not later than `now()`: `304`
     if `updatedAt`, **truncated to whole seconds**, is not later than it.
  3. Otherwise `200`.
- A `200` has `content-type: text/plain; charset=utf-8` and the body; a `304`
  has no body. `HEAD` gets the same status and headers as `GET` and no body.
