Every endpoint inventing its own error shape means every client writes
bespoke parsing. Pick one envelope, map your error types onto it, and never
leak internals.

## Task

Export:

- `ApiError` — `(status, code, message, details?)`, extending `Error`
- `notFound(resource, id)` → 404, code `NOT_FOUND`
- `badRequest(message, details)` → 400, code `BAD_REQUEST`
- `unauthorized()` → 401, code `UNAUTHORIZED`, message `authentication required`
- `toResponse(error, { exposeStack = false })` → `{ status, body }` where body is

```json
{ "error": { "code": "NOT_FOUND", "message": "User 42 not found", "details": {} } }
```

Rules that matter:

1. An `ApiError` maps to its own status, code and message.
2. **Any other** error becomes 500 / `INTERNAL` / `internal server error` — the
   original message must **not** appear in the body. Database errors leak
   schema names and connection strings.
3. `details` is omitted entirely when there is none (not `null`).
4. With `exposeStack: true` (development only) add a `stack` string.

Also export `handler(fn, { logger = console.error })`: wraps an async
`(req, res)` so any thrown error becomes the right JSON response. Hiding the
message from the client must not hide it from *you*: every error that becomes
a 500 is passed, as the original error object, to `logger`. Expected 4xx
`ApiError`s are not logged — they are not bugs.