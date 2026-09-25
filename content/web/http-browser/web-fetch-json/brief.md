`fetch` only rejects when **no HTTP response arrived at all**: DNS failure,
refused connection, CORS block, abort. A `404`, a `500`, a login redirect that
ends on an HTML page — all of those *resolve*, with `response.ok === false` or,
worse, with `ok === true` and a body that is not what you asked for.

Three bugs ship with almost every hand-rolled `fetch` call:

- **Trusting the promise.** `const user = await (await fetch(url)).json()` on a
  404 either throws a confusing `SyntaxError` or quietly hands you
  `{ "error": "not found" }` as if it were a user.
- **Reading the body twice.** A body is a stream; it can be consumed once.
  `try { return await res.json() } catch { return await res.text() }` throws
  `TypeError: Body is unusable` in the `catch`, and the real error is lost.
- **Assuming 200 means JSON.** A dev server or CDN with an SPA fallback answers
  an unknown `/api/usres` with `200` and `index.html`. The famous
  `Unexpected token '<'` comes from here. Check `content-type` before parsing.

## Task

Export three error classes (each `extends Error`, with `name` set to the class
name) and `fetchJson`:

- `HttpError` — properties `status`, `url`, `body`; message
  `` `HTTP ${status} for ${url}` ``.
- `NetworkError` — property `url` and `cause` (the original error); message
  `` `Network error for ${url}` ``.
- `ContentTypeError` — properties `url`, `status` and `contentType` (the raw
  header value, or `null`); message `` `Expected JSON from ${url}` ``.

`fetchJson(fetchImpl, url, init = {})` calls `fetchImpl(url, init2)` exactly
once and resolves to the parsed body. The grader passes a fake `fetchImpl`
that returns real `Response` objects.

1. `init2` is `init` with its headers normalised: if the caller did not set an
   `Accept` header (in any case, and `init.headers` may be a plain object, an
   array of pairs or a `Headers`), add `accept: application/json`. Keep every
   other header and every other `init` field (`method`, `body`, `signal`, …).
2. If `fetchImpl` rejects with an error whose `name` is `'AbortError'`,
   rethrow **that same error** — callers ignore cancellations by name. Any
   other rejection becomes a `NetworkError` whose `cause` is the original.
3. Read the body **once**, as text.
4. A JSON content type is one whose media type (before any `;`) is
   `application/json` or ends in `+json` (e.g. `application/problem+json`),
   case-insensitively.
5. If `response.ok` is false: throw `HttpError` whose `body` is the parsed JSON
   when the type is JSON and it parses, otherwise the raw text; `null` when the
   body is empty.
6. If `response.ok`: status `204`/`205` or an empty body resolves to `null`.
   A non-empty body without a JSON content type throws `ContentTypeError`.
   Otherwise return `JSON.parse(text)` — if a body that claims to be JSON does
   not parse, let the `SyntaxError` propagate.
