Express middleware is a chain of `(req, res, next)` functions. `next()`
passes control on; `next(err)` skips to the error handlers. That is the whole
model, and it is about forty lines.

## Task

Export `createApp()` returning an app object with:

- `use(fn)` — add middleware `(req, res, next)`; returns the app for chaining
- `useError(fn)` — add an error handler `(err, req, res, next)`
- `handle(req, res)` — run the chain

Rules:

1. Middleware run in registration order.
2. Middleware that never calls `next()` ends the chain (it responded itself).
3. `next(err)` — or a **thrown** error, sync or async — jumps to the first
   error handler, skipping remaining normal middleware.
4. If nobody responded by the end, respond `404` with `{"error":"not found"}`.
5. If an error reaches the end with no handler, respond `500` with
   `{"error":"internal error"}`.
6. Calling `next()` twice from one middleware must not run the rest twice.