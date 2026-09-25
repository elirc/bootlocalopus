Your team is taking over the `orders` service, and the first on-call week is
yours. Before then it needs the observability every service in the company
has: a trace id you can find from a customer's report, request metrics that
will not blow up the monitoring bill, probes that tell the orchestrator the
truth, and error reports that do not leak internals to clients. Each of these
was a lesson in this chapter; here they share one request path, and have to
agree with each other.

## Task

Export `createService(options)`:

```js
createService({
  routes,                      // [{ method, path, handler(req, res) }] — path templates like '/orders/:id'
  checks = [],                 // [{ name, critical = true, check(signal) }]
  checkTimeoutMs = 1000,
  report = () => {},           // (event) => void | Promise — the error tracker
  now = () => performance.now(),   // milliseconds
  ids,                         // { traceId(), spanId() } — default: random hex (32 and 16 chars)
  timers = { setTimeout, clearTimeout },
})
```

returning `{ handler, setDraining, outgoingHeaders }`.

### Infrastructure endpoints

`GET /metrics`, `GET /livez` and `GET /readyz` are answered directly; they are
never routed, traced or counted in the metrics.

- **`/livez`** → `200` `{ "status": "ok" }`, running no checks.
- **`/readyz`** → `503` `{ "status": "draining" }` after `setDraining(true)`
  (until `setDraining(false)`). Otherwise run every check **in parallel**,
  each with an `AbortSignal` and a `timers.setTimeout(…, checkTimeoutMs)`
  (cleared when the check settles first); a check that throws, rejects or
  times out (error `'timeout'`, signal aborted) fails. Answer
  `{ status, checks }` with `checks[name]` = `{ "status": "ok" }` or
  `{ "status": "fail", "error": message }`; `status` is `'fail'` (**503**) if
  a critical check failed, else `'degraded'` (**200**) if any failed, else
  `'ok'` (**200**).
- **`/metrics`** → `200`, `content-type: text/plain; version=0.0.4`, sample
  lines (comment lines optional):

  ```
  http_requests_total{method="GET",route="/orders/:id",status="200"} 3
  http_request_duration_seconds_bucket{method="GET",route="/orders/:id",le="0.1"} 2
  http_request_duration_seconds_bucket{method="GET",route="/orders/:id",le="0.5"} 3
  http_request_duration_seconds_bucket{method="GET",route="/orders/:id",le="1"} 3
  http_request_duration_seconds_bucket{method="GET",route="/orders/:id",le="+Inf"} 3
  http_request_duration_seconds_sum{method="GET",route="/orders/:id"} 0.18
  http_request_duration_seconds_count{method="GET",route="/orders/:id"} 3
  ```

The infrastructure endpoints answer JSON (except `/metrics`) and ignore any
query string; other methods on those paths are routed like any request.

### Every other request

1. **Trace.** A valid W3C `traceparent` (lowercase hex `00-<32>-<16>-<2>`,
   version not `ff`, ids not all zeros, nothing after the flags for version
   `00`) is continued: same trace id, sampled flag from bit 0 of the flags,
   and a new span id from `ids.spanId()`. Anything else starts a new trace
   (`ids.traceId()`, then `ids.spanId()`, sampled). Set the response header
   `x-trace-id`, and keep the context in `AsyncLocalStorage` for the whole
   request: **`outgoingHeaders()`** returns
   `{ traceparent: '00-<traceId>-<this spanId>-<01|00>' }` inside a request
   (across `await`s, never mixing concurrent requests), `{}` outside one.
2. **Route.** Templates as in the request-metrics lesson: `:name` matches one
   non-empty segment and fills `req.params`; the query string is ignored; the
   first route whose method and path match wins. No match → `404`
   `{ "error": { "code": "NOT_FOUND" } }`, route label `unmatched`.
3. **Errors.** If the handler throws or rejects with `error`:
   - `error.status` an integer 400–499 → that status with
     `{ "error": { "code": error.code ?? 'BAD_REQUEST', "message": error.message } }`;
     not reported.
   - otherwise → `500` `{ "error": { "code": "INTERNAL", "message": "internal error" } }`
     and `report({ name, message, method, route, traceId })` (the raw
     `req.method`; `route` the template). A `report` that throws or rejects
     is ignored.
4. **Metrics.** When the response finishes, count it and observe its
   duration (from arrival to `'finish'`, in seconds) with labels `method`
   (`GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, else
   `other`), `route` (the template, or `unmatched`) and — for the counter —
   `status`. Buckets `0.1, 0.5, 1`, cumulative, inclusive.
