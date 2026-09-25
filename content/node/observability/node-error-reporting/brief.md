You wire an error tracker (Sentry, Bugsnag, your own endpoint) into the API
with `catch (e) { report(e) }`. Then, in order:

- A bot hammers a broken endpoint and sends **40,000 identical reports** an
  hour. The tracker's quota runs out by 9 a.m., and the one new error that
  mattered that day is dropped.
- `User 8812 not found` and `User 9113 not found` show up as **thousands of
  different issues**, because the ids make every message unique.
- A report includes the request body, and now the tracker stores customers'
  **passwords and tokens**.
- Every `404` and every validation `422` is reported, so the error list is
  noise and nobody reads it.
- The tracker's API is down, `report()` rejects, and the unhandled rejection
  **crashes the process** that was trying to report an error.

An error reporter is small, and every one of those is its job.

## Task

### `createReporter(options)` → `{ capture }`

```js
createReporter({
  transport,                 // (event) => void | Promise — sends one event
  now = Date.now,
  windowMs = 60_000,
  maxPerWindow = 5,
  release = null,            // e.g. the git sha, attached to every event
  scrubKeys = ['password', 'token', 'authorization', 'cookie', 'secret'],
})
```

**`capture(error, context = {})`** returns `true` if the event was handed to
`transport`, `false` if it was suppressed. It **never throws**, and a
`transport` that throws or rejects is ignored (no unhandled rejection).

- **Normalise**: an `Error` instance gives `name`, `message`, `stack`; any
  other thrown value gives `name: 'NonError'`, `message: String(value)`,
  `stack: null`.
- **Fingerprint**: `` `${name}: ${normalised message}` ``, where the message
  has every UUID (`8-4-4-4-12` hex digits, any case) replaced with `<uuid>`
  **first**, then every run of digits with `<n>`:
  `'User 8812 not found'` → `'Error: User <n> not found'`.
- **Rate limit per fingerprint**: a window opens at the first event of a
  fingerprint; while `now() - windowStart < windowMs`, at most `maxPerWindow`
  events are sent and the rest are suppressed. The first event at or after
  the window's end opens a new window.
- **Event** passed to `transport`:

  ```js
  { fingerprint, name, message, stack, release,
    timestamp,     // new Date(now()).toISOString()
    suppressed,    // events of this fingerprint suppressed since the last one sent
    context }      // scrubbed copy
  ```

- **Scrubbing**: copy `context` deeply (plain objects and arrays); any key
  whose lower-cased name **contains** one of `scrubKeys` (lower-cased) gets
  the value `'[scrubbed]'` — `password`, `newPassword`, `x-auth-token`,
  `Authorization`. Never modify the caller's object.

### `wrapHandler(handler, reporter)` → a Node `(req, res)` handler

Runs `handler(req, res)`. If it throws or rejects with `error`:

- `error.status` is an integer from 400 to 499 → a client error: respond with
  that status and JSON `{ "error": { "code": error.code ?? 'BAD_REQUEST', "message": error.message } }`.
  **Do not report it.**
- anything else → `reporter.capture(error, { method, path, requestId })`
  (`path` without the query string, `requestId` from the `x-request-id`
  header or `null`), then respond `500` JSON
  `{ "error": { "code": "INTERNAL", "message": "internal error" } }` — the
  real message stays in the report, not the response.
- if the response headers were already sent, report (for a 5xx-type error)
  and `res.destroy()` instead of responding.
