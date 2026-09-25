You add request metrics to the API in ten minutes:

```js
requests.inc({ method: req.method, path: req.url, status: res.statusCode });
```

A week later the monitoring system is out of memory. `path: req.url` made a
separate time series for `/users/1`, `/users/2`, … `/users/481113`, every
`?page=` value, and every path a vulnerability scanner tried. `req.method`
straight from the client let anyone mint series with made-up methods. And the
latency numbers look great because they were measured when the handler
**returned** — before the streaming response was actually sent.

Request metrics are only useful if their labels are **bounded**: the route
**template** (`/users/:id`), never the raw path; a fixed set of methods; the
status code. And durations run until the response **finishes**.

## Task

Export `createApp(routes, { now = () => performance.now() } = {})`, returning
a Node `(req, res)` handler. `now()` is in milliseconds.

`routes` is an array of `{ method, path, handler }`, where `path` is a
template like `/users/:id/orders/:orderId`: a `:name` segment matches exactly
one non-empty path segment, any other segment must match literally, and the
query string is ignored. The first route whose method and path match handles
the request as `handler(req, res)` (sync or async), with `req.params` set to
the captured segments. No match → `404` JSON `{ "error": { "code": "NOT_FOUND" } }`.
A handler that throws or rejects before sending headers → `500` JSON
`{ "error": { "code": "INTERNAL" } }`.

### Recording

For every request except `GET /metrics`:

- **labels**: `method` is the request method if it is one of `GET`, `HEAD`,
  `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, otherwise `other`; `route` is
  the matched **template**, or `unmatched`; `status` is the final
  `res.statusCode`.
- **`http_requests_total{method,route,status}`** — a counter.
- **`http_request_duration_seconds{method,route}`** — a histogram with
  buckets `0.05, 0.1, 0.25, 0.5, 1`, in seconds, measured from when the
  request arrived until the response's `'finish'` event.
- **`http_requests_in_flight`** — a gauge (no labels): requests that have
  arrived and not finished.

Count the request and observe its duration once, on `'finish'`.

### `GET /metrics`

`200`, `content-type: text/plain; version=0.0.4`, with one line per sample
(`# ` comment lines are allowed and ignored by the grader):

```
http_requests_total{method="GET",route="/users/:id",status="200"} 2
http_request_duration_seconds_bucket{method="GET",route="/users/:id",le="0.05"} 1
…
http_request_duration_seconds_bucket{method="GET",route="/users/:id",le="+Inf"} 2
http_request_duration_seconds_sum{method="GET",route="/users/:id"} 0.35
http_request_duration_seconds_count{method="GET",route="/users/:id"} 2
http_requests_in_flight 1
```

Labels appear in exactly the order shown; buckets are cumulative (a value
equal to a bound counts in it); numbers print with `String()`. The
`http_requests_in_flight` line is always present. Line order is up to you.
