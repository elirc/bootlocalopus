`console.log('user ' + id + ' failed')` is fine until the incident, when you
need "every line for request `9f2c…`" out of ten thousand interleaved lines
from fifty concurrent requests. Production logs are **one JSON object per
line** so a machine can filter them, and every line carries the **request id**
— without passing it through every function signature.

`AsyncLocalStorage` (from `node:async_hooks`) is how: `als.run(store, fn)`
makes `als.getStore()` return `store` inside `fn` **and everything it
schedules** — awaits, timers, callbacks — while a concurrent request sees its
own store.

## Task

### `createLogger(options)` → a logger

Options: `write = (line) => process.stdout.write(line + '\n')`,
`level = 'info'`, `now = Date.now`,
`redact = ['password', 'authorization', 'cookie', 'token']`.

The logger has `debug`, `info`, `warn` and `error(msg, fields = {})`, and
`child(bindings)`.

- Each call below the configured level (`debug < info < warn < error`) writes
  nothing. Otherwise it calls `write` **once** with a JSON string (no trailing
  newline) of one object:
  `{ level, time, msg, ...context, ...bindings, ...fields }`
  - `time` is `new Date(now()).toISOString()`
  - `context` is the current `withContext` fields (below)
  - later sources win (`fields` over `bindings` over `context`), except that
    `level`, `time` and `msg` are **reserved**: nothing overrides them.
- `child(bindings)` returns a logger with the same options whose lines also
  carry `bindings`. A child's child merges both (the inner one wins).
- **Redaction**: any key whose lowercased name is in `redact` — at any depth,
  inside nested objects and arrays — keeps its **key** and has its **value**
  replaced by `"[REDACTED]"`. (Dropping the key hides the fact that a
  password was being logged at all.) Never mutate the caller's object.
- An `Error` anywhere in the fields becomes `{ name, message, stack }` —
  `JSON.stringify(new Error('x'))` is `{}`, which is how incidents lose their
  only clue.
- A **circular** reference becomes the string `"[Circular]"`. A logger must
  never throw.

### `withContext(fields, fn)`

Runs `fn` and returns its result; every line logged inside it, synchronously
or after any number of awaits and timers, includes `fields`. Nested calls
merge with the outer context (inner wins). Outside any `withContext`, lines
have no context fields at all.

### `requestLogging(handler, { logger, genId = () => crypto.randomUUID() })`

Returns an HTTP `(req, res)` handler that:

1. takes the request id from the `x-request-id` header if it matches
   `/^[A-Za-z0-9._-]{1,64}$/`, else uses `genId()` (never echo arbitrary
   client text into your logs and headers);
2. sets the `x-request-id` response header to it;
3. runs `handler(req, res)` inside `withContext({ requestId })`;
4. when the response finishes, logs at `info`: msg `"request completed"` with
   `{ method, path, status }` (`path` without the query string) — and the
   `requestId`;
5. if the handler throws or rejects: logs at `error` msg `"request failed"`
   with `{ err }`, and answers `500` `{"error":"internal error"}` if nothing
   has been sent yet.
