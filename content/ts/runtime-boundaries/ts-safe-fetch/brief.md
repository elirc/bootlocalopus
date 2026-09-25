`const user = (await (await fetch(url)).json()) as User` fails in four
different ways, and all of them look the same from the outside:

- the network is down: `fetch` rejects with a bare `TypeError: fetch failed`;
- the server answers **404 or 500**: `fetch` does **not** reject. You parse the
  error body as if it were a `User`;
- a proxy answers **502 with an HTML page**: `.json()` throws
  `SyntaxError: Unexpected token <`, which reads like a bug in your code;
- the server changed shape: nothing throws at all, and `user.name` is
  `undefined` three screens later.

A typed wrapper makes these four **different, named failures**, so the UI can
say "you're offline" rather than "something went wrong", the logs say which
endpoint changed shape, and retry logic retries only what is worth retrying.

This lesson has **runtime** tests; `fetchFn` is injected, and the tests hand
you real `Response` objects.

## Task

`ApiError` (with `kind`, `method`, `url`) is given. `method` is always
`(init?.method ?? 'GET').toUpperCase()`. `<where>` below is `` `${method} ${url}` ``.

**`class HttpError extends ApiError`**: kind `'http'`, `name` `'HttpError'`,
`status`, `body` (the response text cut to its first **200** characters), and
`retryable`, which is `true` for 408, 429 and every status ≥ 500, else `false`.
Message: `` `${where} failed with ${status}` ``.

**`fetchJson(fetchFn, url, parse, init?)`**, in this order:

1. Call `fetchFn(url, init)`, passing `init` through untouched. If it
   rejects, throw `ApiError` kind `'network'`, message
   `` `Network error calling ${where}` ``, `cause` the original error.
2. Read the body **once** with `res.text()`.
3. If `!res.ok`, throw an `HttpError`, whatever the body is. Do not call
   `parse`.
4. An empty body gives `undefined`. Otherwise `JSON.parse` it; if that throws,
   throw `ApiError` kind `'parse'`, message `` `Invalid JSON from ${where}` ``,
   `cause` the `SyntaxError`.
5. Return `parse(body)`. If `parse` throws, throw `ApiError` kind
   `'validation'`, message
   `` `Unexpected response shape from ${where}: ${detail}` ``, where `detail` is
   the thrown error's `message` (or `String(thrown)` for a non-Error), and
   `cause` is what `parse` threw.

**`describeFailure(error: unknown): string`**, for the UI:

| error | message |
| --- | --- |
| kind `network` | `You appear to be offline.` |
| `HttpError` 401 | `Please sign in again.` |
| `HttpError` 404 | `Not found.` |
| any other retryable `HttpError` | `The service is busy. Try again shortly.` |
| any other `HttpError` | `Request failed.` |
| kind `parse` or `validation` | `Unexpected response from the server.` |
| not an `ApiError` | `Something went wrong.` |

The trap is the order of steps 3 and 4. Parse first and the HTML 502 page
becomes a `'parse'` error, the user is told the server is broken rather than
busy, and nothing retries it.
