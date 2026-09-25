A mobile client sends `POST /payments`, the connection drops before the
response arrives, and the client retries. Did the first one go through? It
cannot know, so without help the customer is charged twice.

The standard answer (Stripe, PayPal, the IETF draft) is an
**`Idempotency-Key` header**: the client generates a unique key per logical
operation and reuses it on retries. The server remembers the first response
for that key and **replays** it instead of running the operation again.

Three details are where implementations go wrong:

1. **Concurrent retries.** The retry can arrive while the first attempt is
   still running. Both see "no stored response" and both charge. You must
   record the key as *in progress* before running the handler.
2. **Key reuse.** A buggy client reuses a key for a *different* request.
   Replaying the old response would be a lie; refuse it.
3. **Failures.** If the operation crashed (5xx), nothing durable happened —
   the client must be able to retry with the same key, so do not store it.

## Task

Handlers in this lesson return a response instead of writing one:
`async (req, rawBody) => ({ status, body })`, where `rawBody` is the request
body as a string and `body` is JSON-serialisable.

Export `withIdempotency(handler, { now = Date.now, ttlMs = 86_400_000 } = {})`
returning a Node `(req, res)` handler. It reads the whole request body, then:

- **Pass-through.** Not a `POST`, or no `idempotency-key` header: call the
  handler and send its response. Nothing is remembered.
- **Invalid key.** A key not matching `/^[A-Za-z0-9_-]{1,64}$/` →
  `400` with code `INVALID_IDEMPOTENCY_KEY`; the handler is not called.
- **First use.** Record the key as in progress with a **fingerprint** of the
  request (method, `req.url` and the raw body), call the handler, send its
  response. If the status is **below 500**, store `{ status, body }` against
  the key. If it is 5xx or the handler throws, forget the key entirely (a
  throw is answered `500` with code `INTERNAL`).
- **In progress.** Same key while the first request is still running →
  `409` with code `IDEMPOTENCY_KEY_IN_USE` and a `retry-after: 1` header.
- **Replay.** Same key, same fingerprint, stored response → the stored
  status and body, plus the header `idempotent-replayed: true`, **without**
  calling the handler.
- **Reuse.** Same key, different fingerprint (whether stored or in
  progress) → `422` with code `IDEMPOTENCY_KEY_REUSED`.
- **Expiry.** A stored response older than `ttlMs` (`now() - storedAt >=
  ttlMs`) is forgotten, and the request counts as a first use.

Every response is JSON with `content-type: application/json`. Errors use the
envelope `{ "error": { "code": "…", "message": "…" } }` (message wording is
yours).
