```ts
async get<T>(path: string): Promise<T> {
  const res = await fetch(base + path);
  return res.json();            // Promise<any>, returned as T
}
```

This signature makes four promises it cannot keep. The request can fail
before any response arrives. The server can answer `502` with an HTML page.
A `200` can carry a body that is not JSON (a login page from a proxy). And
JSON that parses can still be the wrong shape. The code turns the first three
into exceptions of unrelated types, and the fourth into an object that is
typed `T` and is not one.

A typed client makes each of those failures a **value** with its own
discriminant, so callers `switch` on it and the compiler checks they did.

## Task

The types are in the starter: `ApiError`, `ApiResult<T>`, `Parser<T>`,
`ClientOptions`, `ApiClient`. Implement **`createClient(options)`** returning
`{ get(path, parse), post(path, body, parse) }`. Both return
`Promise<ApiResult<T>>` and **never reject**.

Requests:

- The URL is `baseUrl` and `path` joined by **exactly one** `/`, whether or
  not `baseUrl` ends with one or `path` starts with one.
- Use `options.fetch(url, init)`, never the global `fetch`.
- Every request sends `accept: application/json` plus every header in
  `options.headers`.
- `get` uses method `'GET'`. `post` uses method `'POST'`, sends
  `JSON.stringify(body)` as the body, and adds
  `content-type: application/json`.

Results, in this order:

1. `fetch` rejects → `{ ok: false, error: { kind: 'network', cause } }` where
   `cause` is exactly what it threw.
2. Status outside 200–299 (`response.ok` is false) →
   `{ kind: 'http', status, body }`, where `body` is the response body **as
   text**, whatever its format. Do not call the parser.
3. Otherwise read the body as text. An empty body (a `204`, say) is
   `undefined`; anything else goes through `JSON.parse`, and a syntax error
   is `{ kind: 'parse', message }` with the error's message.
4. Call `parse(data)`. If it returns, the result is `{ ok: true, value }`. If
   it throws, `{ kind: 'parse', message }`: the error's `message`, or
   `String(thrown)` when what was thrown is not an `Error`.

Every `ok: false` result has exactly the keys shown (`ok`, `error`, and the
error's own fields).

The trap is reading the body twice: `response.json()` consumes it, so a
failed `json()` leaves nothing to report as text. Read `text()` once and parse
it yourself.
