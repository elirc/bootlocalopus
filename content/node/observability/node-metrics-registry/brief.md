Logs tell you what happened to one request. **Metrics** tell you how the
whole service is doing: requests per second, error rate, queue depth. The
de-facto format is Prometheus's text exposition — a scraper `GET`s
`/metrics` every 15 seconds and reads lines like:

```
# HELP jobs_processed_total Jobs processed by the worker.
# TYPE jobs_processed_total counter
jobs_processed_total{queue="email",outcome="ok"} 1027
jobs_processed_total{queue="email",outcome="failed"} 3
```

Each distinct combination of label values is a separate **time series**,
stored forever by the monitoring system. That is the trap: put a user id or a
raw URL in a label and one metric becomes a million series, and the
monitoring bill (or the Prometheus server) explodes. A production registry
**caps series per metric** and drops the excess rather than taking the
monitoring down with it.

## Task

Export `createRegistry({ maxSeries = 1000 } = {})`, returning
`{ counter, gauge, metrics }`.

**`counter({ name, help, labelNames = [] })`** and **`gauge({ … })`** register
a metric and return it.

- `name` must match `/^[a-zA-Z_:][a-zA-Z0-9_:]*$/`, and each label name
  `/^[a-zA-Z_][a-zA-Z0-9_]*$/` without a leading `__`; otherwise throw a
  `TypeError`. Registering a name twice throws an `Error`.

A counter has `inc(labels = {}, value = 1)`. A gauge has `set(labels, value)`,
`inc(labels = {}, value = 1)` and `dec(labels = {}, value = 1)`. For both:

- `labels` must have **exactly** the declared label names — a missing or an
  extra one throws a `TypeError`. Values are converted with `String()`.
- `value` must be a finite number; a counter also refuses negative values
  (counters only go up — use a gauge). Throw a `RangeError`.
- Every metric has a `dropped` getter: how many updates were discarded
  because they would have created series number `maxSeries + 1`. Updates to
  series that already exist are never dropped.

**`metrics()`** returns the text exposition:

- metrics in registration order, each as `# HELP <name> <help>`, then
  `# TYPE <name> counter|gauge`, then one line per series in the order the
  series first appeared, then the next metric. The whole text ends with `\n`.
- a series line is `name{l1="v1",l2="v2"} value`, labels in `labelNames`
  order; a metric without labels is just `name value`, and prints `name 0`
  before anything touched it. A labelled metric with no series yet prints
  only its two comment lines.
- escape label values: `\` → `\\`, `"` → `\"`, newline → `\n`. In `help`,
  escape `\` and newline the same way.
- values print with `String(value)`.

Two different label sets must never share a series — including
`{ a: 'x,y', b: 'z' }` and `{ a: 'x', b: 'y,z' }`.
