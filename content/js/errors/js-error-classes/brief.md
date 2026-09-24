A caller needs to distinguish "the user typed something wrong" (show a
form message) from "the database is down" (retry, page someone). That means
distinguishable error types carrying structured data.

## Task

Export:

- `AppError` — extends `Error`. Constructor `(message, options = {})` where
  options may hold `code`, `status`, and `cause`. Sets `name` to the concrete
  subclass's name, defaults `code` to `'APP_ERROR'` and `status` to `500`, and
  exposes `toJSON()` returning `{ name, message, code, status }`.
- `ValidationError` — extends `AppError`. `(message, fields = {})`, code
  `'VALIDATION'`, status `400`, and a `fields` object.
- `NotFoundError` — extends `AppError`. `(resource, id)`, message
  ````User 42 not found````, code `'NOT_FOUND'`, status `404`, plus
  `resource` and `id` properties.
- `isRetryable(error)` — true for status ≥ 500 or a missing status, false for
  4xx.

Every instance must satisfy `instanceof Error`, and a captured
`error.stack` must exist.