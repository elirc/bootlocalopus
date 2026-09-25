Two error-handling bugs ship in almost every API:

1. **The leak.** The catch-all handler sends `err.message` to the client, and
   one day that message is
   `connect ECONNREFUSED 10.0.3.7:5432 password=…`, or a SQL fragment.
2. **The lost status.** The repository throws `NOT_FOUND`, the service wraps
   it for context (`new Error('loading profile', { cause })`, which is the
   right thing to do), and the handler, which only looks at the outer error,
   answers **500** instead of 404.

The fix is a small, typed error vocabulary: errors you throw **on purpose**
carry a code, the code decides the status and whether the message is safe to
show, and everything else is a bare 500 with the details kept in your logs.

This lesson has **runtime** tests.

## Task

`ERROR_CODES`, `ErrorCode` and `Problem` are given.

**`class AppError extends Error`**:
`new AppError(code, message, options?)`, where options may have `cause` and
`details` (a plain object). It has `name` `'AppError'`, `code`, `status` (from
`ERROR_CODES`) and `details` (`undefined` when not given). Pass `cause` to
`super(message, { cause })` **only when one was given**: an `AppError` without
a cause has no own `cause` property.

**`isAppError(value, code?)`**: `true` for an `AppError` instance (and, when
`code` is given, with that code). A plain object that merely looks like one
does not count.

**`findAppError(value)`**: the first `AppError` in the cause chain, starting
with `value` itself and following `.cause` **while the current value is an
`Error`**. Returns `undefined` if there is none. A cause chain can loop
(`a.cause = b; b.cause = a`), so remember what you have visited and stop on a
repeat.

**`toProblem(value: unknown, instance?: string): Problem`**: an RFC 9457
"problem details" body, as a **new** object each time:

- if `findAppError(value)` finds an error whose code has `expose: true`:
  `{ type, title, status, detail }`, where `type` is
  `https://errors.example.com/` + the code lowercased with `_` → `-`
  (`RATE_LIMITED` → `rate-limited`), `title` and `status` come from the table,
  `detail` is the error's message, and `details` is added **only if** the
  error has some;
- **anything else**, including an `INTERNAL` `AppError`, becomes exactly
  `{ type: 'about:blank', title: 'Internal Server Error', status: 500 }`, with
  no detail and no details;
- in both cases, add `instance` only when it is given.

The trap in `findAppError` is `while (e.cause) e = e.cause`. It works in every
test you would think to write, and hangs the process on the first cyclic
chain. Here that shows up as a timeout.
