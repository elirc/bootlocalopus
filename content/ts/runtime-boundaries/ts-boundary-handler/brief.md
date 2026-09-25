Everything in this chapter meets at one place: the function that turns an
untrusted HTTP request into a call to your typed code and back. Get it wrong
and you get the classic incident list. `JSON.parse` of a `text/plain` body
throws a 500. A 5 MB body is parsed in full before anyone checks it. A
validation failure comes back as 500 instead of 422. And a database error
message, with a connection string in it, goes back to the client.

In this boss you build that function once, as a factory: give it a parser and
a handler, and it does every boundary check in the right order, maps every
failure to the right status, and logs one line per request.

This lesson has **runtime** tests. Everything is injected (`requestId`, `log`),
so no server or clock is involved.

## Task

Export **`createJsonHandler(options)`** returning `async (req: Req) => Res`
(the types and `ClientError` are in the starter). Per request, call
`options.requestId()` **once**. Then, **in this order**:

| step | failure | status | `title` |
| --- | --- | --- | --- |
| 1. `req.method.toUpperCase()` equals `options.method` | otherwise | 405, plus header `allow: <options.method>` | `Method Not Allowed` |
| 2. `content-type` header's media type (before any `;`, trimmed, case-insensitive) is `application/json` | missing or other | 415 | `Unsupported Media Type` |
| 3. body size in **UTF-8 bytes** ≤ `maxBodyBytes` (default `10000`) | too big | 413 | `Payload Too Large` |
| 4. `JSON.parse(req.body)` | throws | 400 | `Malformed JSON` |
| 5. `options.parse(json)` | `{ ok: false, issues }` | 422, body also has `errors: issues` | `Validation Failed` |
| 6. `await options.handle(value, { requestId })` | throws a `ClientError` | `error.status`, body also has `detail: error.message` | `Request Failed` |
| | throws anything else | 500 | `Internal Server Error` |

Anything thrown by `parse`, by `handle` (synchronously or not), or by
`JSON.stringify` of the result is caught the same way as step 6: a
`ClientError` gets its own status, anything else a 500.

**Error responses**: header `content-type: application/problem+json`, body
`JSON.stringify({ type: 'about:blank', title, status, …extras, requestId })`,
where the extras are `detail` or `errors` from the table and nothing else.
**A 500 never contains the error's message.**

**Success**: if `handle` returns `undefined`, status **204**, empty body, and
no content-type. Otherwise `options.successStatus` (default `200`), header
`content-type: application/json; charset=utf-8`, body `JSON.stringify(result)`.

**Every** response also gets the header `x-request-id: <id>`.

**Logging**: after the response is built, call `options.log` exactly once with
`{ level, requestId, method, path, status }`, where `method` and `path` are
from `req` as given, and `level` is `'info'` below 400, `'warn'` for 4xx and
`'error'` for 5xx. For an unexpected error (the 500 case) add
`error: <message>` (the `Error`'s message, or `String(thrown)`), so the detail
lives in your logs rather than the client's hands. There is no `error` key otherwise.

Traps: `req.body.length` counts characters, not bytes (`'é'` is 2 bytes; use
`Buffer.byteLength(body, 'utf8')`). And `JSON.stringify` **throws** on a
`BigInt`, so serialising the result belongs inside your `try`.
