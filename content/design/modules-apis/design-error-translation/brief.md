The user store below is in production. Its `findById` catches everything and
returns `null`, so when the database restarts, the signup flow concludes the
user does not exist and creates a second account. Its `create` wraps every
failure as `new Error('Database error: …')`, so the signup handler can only
tell "email already taken" (show a form message) from "database down" (503,
retry) by grepping the message for `duplicate key`. And a typo in a column
name comes out looking like an outage.

A module's errors are part of its API. Design them in three buckets:

1. **Expected answers** are return values. "No user with that id" from a
   `find…` function is `null`, not an exception.
2. **Failures a caller can act on** get their own error types, translated at
   the boundary from whatever the driver throws, with the original kept as
   `cause`.
3. **Bugs** (a SQL syntax error, a `TypeError` in your code) are **not
   translated**. Rethrow the exact same object so the stack trace and message
   reach your error tracker intact.

## Task

The driver (`db`) has `insert(table, row)` → the stored row with its `id`,
`findOne(table, { id })` → a row or `undefined`, and
`update(table, { id }, patch)` → an array of updated rows. It rejects with
node-postgres-style errors: an `Error` with a string `code` (and, for
constraint violations, a `constraint` name) — or occasionally with something
that is not an `Error` at all.

Export three error classes (each extends `Error` and sets `name` to the class
name):

- `EmailTakenError` — message `'That email address is already registered'`,
  an `email` property, and `cause`.
- `UserNotFoundError` — an `id` property.
- `StoreUnavailableError` — `retryable: true`, and `cause`.

and `createUserStore(db)` returning:

| method | resolves | rejects |
| --- | --- | --- |
| `findById(id)` | the user, or `null` | |
| `getById(id)` | the user | `UserNotFoundError` when there is none |
| `create({ email, name })` | the stored user | `EmailTakenError` |
| `rename(id, name)` | the updated user | `UserNotFoundError` when no row changed |

On **every** method, translate driver errors like this:

| driver error | becomes |
| --- | --- |
| `code === '23505'` **and** `constraint === 'users_email_key'` | `EmailTakenError` |
| `code` is `'ECONNREFUSED'`, `'ECONNRESET'`, `'ETIMEDOUT'` or `'57P01'`, or starts with `'08'` (SQLSTATE class 08, connection exceptions) | `StoreUnavailableError` |
| anything else | rethrown unchanged — the very same value |

## The traps

- A `catch` that returns `null` turns "the database is down" into "no such
  user". Only the driver's *answer* (`undefined`) means absent.
- A unique violation on some other constraint is not "email taken". Check the
  constraint name.
- `error.code.startsWith` throws if the rejection is a string or has no
  `code`. Guard with `typeof error?.code === 'string'`.
- Write the translation once (a small `translate(error)` plus a wrapper every
  method goes through) rather than four slightly different `catch` blocks.
