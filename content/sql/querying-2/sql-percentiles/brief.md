"Average response time: 39 ms" — and yet users complain. Nine requests took
about 15 ms and one took 250 ms: the average describes none of them.
Latency is reported as **percentiles**: the median (p50) is the typical
request, p95 is what one in twenty users sees, and the max is the outlier you
go looking for in the logs.

Postgres computes them with **ordered-set aggregates**:

```sql
percentile_cont(0.5) within group (order by duration_ms)  -- interpolates
percentile_disc(0.95) within group (order by duration_ms) -- an actual value
```

`percentile_cont` interpolates between the two middle values, so the median of
`10, 20` is `15` — a duration that never happened, but the conventional median.
`percentile_disc` returns the first value whose cumulative share reaches the
fraction: always a real observation, which is what you want when you are
going to grep the logs for it. Both return `double precision`, and
`round(x, 1)` only exists for `numeric`, so cast first.

The fixture has `request_logs(id, endpoint, status, duration_ms)`.

## Task

One query, one row per endpoint that has **at least 5** requests (a p95 of
four requests is noise):

| column | value |
| --- | --- |
| `endpoint` | |
| `requests` | number of requests (an integer) |
| `p50_ms` | `percentile_cont(0.5)` of `duration_ms`, rounded to 1 decimal place |
| `p95_ms` | `percentile_disc(0.95)` of `duration_ms` |
| `max_ms` | the largest `duration_ms` |
| `error_rate` | the share of requests with `status >= 500`, rounded to 3 decimal places (`0.1` for 1 in 10) |

Order by `p95_ms` descending, then `endpoint`. Watch the division in
`error_rate`: `count / count` in integers is `0`.
