Under overload a server that accepts everything serves **nobody** well:
every request gets a sliver of CPU and a growing queue wait, latencies climb
past every client's timeout, and you are now doing 100% of the work for 0% of
the successful responses. Clients retry, and it gets worse.

**Load shedding** is refusing some work, early and cheaply, so the rest
succeeds. Past a limit of requests in flight, answer `503` with a
`Retry-After` straight away — before parsing bodies or touching a database.
A fast, honest "not now" is far better than a slow timeout.

Two refinements make it production-grade:

- **Priorities.** Not all traffic is equal. Keep a reserve of capacity that
  only critical requests (checkout, not recommendations) may use.
- **Exempt health checks.** If `/healthz` is shed, the load balancer decides
  the instance is dead and moves its traffic to the others — which are just
  as loaded. Now a partial overload is a cascading one.

And the accounting must be exact: a request leaves the in-flight count once,
whether it finished, failed, or the client hung up.

## Task

Export `createShedder({ maxInFlight, criticalReserve = 0, retryAfterSec = 1, exempt = ['/healthz'] })`
returning `{ wrap, stats }`.

**`wrap(handler)`** returns a `(req, res)` request handler:

- If the request's pathname (the URL before any `?`) is in `exempt`, call
  `handler(req, res)` directly. It is never shed and never counted.
- A request is **critical** when its `x-priority` header is exactly
  `'critical'`. A critical request is admitted while `inFlight < maxInFlight`;
  any other request while `inFlight < maxInFlight - criticalReserve`.
- Not admitted → `503` with `content-type: application/json`,
  `retry-after: <retryAfterSec>` and body `{ "error": "overloaded" }`; the
  handler is **not** called.
- Admitted → it counts as in flight until its response **closes**
  (`res.on('close')` fires whether it finished normally or the client went
  away) — counted down exactly once. Call `handler(req, res)`; if it throws or
  its promise rejects and no headers were sent yet, answer `500`
  `{ "error": "internal" }`.

**`stats()`** → `{ inFlight, shed }`, where `shed` counts every 503 so far.
