The body you send is only half of a request; the `Content-Type` that
describes it is the other half, and it is where most "the server says my
payload is empty" bugs come from:

- `body: JSON.stringify(data)` **without** `content-type: application/json`
  goes out as `text/plain`, and Express's `json()` parser silently skips it.
- `headers: { 'content-type': 'multipart/form-data' }` on a `FormData` body
  **breaks** the upload: the real header needs a `boundary=…` parameter that
  only the browser knows. With `FormData`, never set the content type.
- `if (options.json)` skips a legitimate JSON body of `0`, `false`, `''` or
  `null`.
- `fetch(url, { method: 'patch' })` sends a lower-case `patch`. `fetch`
  upper-cases only `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT`; any
  other method goes out exactly as written, and many servers reject it.

## Task

Export `createRequest(url, options = {})` that returns a real `Request`
(the same object `fetch` accepts). `url` is absolute. Options:

- `method` — upper-cased. Default `'POST'` when there is a body, else `'GET'`.
- `headers` — any shape `Headers` accepts. Kept as given.
- Exactly **one** body option, or none. Pass two and throw a `TypeError`.
  A body option counts as passed when its key is present (`'json' in options`),
  whatever its value.
  - `json` — any value. Body is `JSON.stringify(value)`; set
    `content-type: application/json` **unless the caller's headers already
    have a content type** (e.g. `application/merge-patch+json`).
  - `form` — a plain object sent as `application/x-www-form-urlencoded`.
  - `multipart` — a plain object sent as `multipart/form-data`. A `Blob` or
    `File` value is appended as a file (keeping a `File`'s name). If the
    caller's headers contain a content type, **remove it** so the one with the
    boundary is used.
- For `form` and `multipart` values: skip `null` and `undefined`, append one
  entry per element for an array (in order), and convert everything else that
  is not a `Blob` with `String(value)`.
- A body with method `GET` or `HEAD` throws a `TypeError` (the `Request`
  constructor already does this for you).

Let `URLSearchParams` and `FormData` do the encoding: `new Request(url, { body })`
sets the right `Content-Type` for both.
