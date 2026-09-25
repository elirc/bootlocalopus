The dashboard says average checkout latency is 180 ms, and support says
checkout is timing out. Both are true: 98% of requests take 100 ms and 2% take
4 seconds. The **average hides the tail**, and the tail is the users who
leave. You alert on percentiles — p95, p99 — not means.

You cannot keep every duration to compute exact percentiles across a fleet,
so services record a **histogram**: counts of observations per bucket
("≤ 0.1 s", "≤ 0.25 s", …), plus a sum and a count. Buckets from many servers
can be added together, and a percentile is **estimated** from them by
interpolating inside the bucket where it falls. That estimate is only as good
as the bucket boundaries — which is why choosing buckets around your SLO
(say, 300 ms) matters more than the maths.

In Prometheus buckets are **cumulative**: the `le="0.5"` bucket counts every
observation ≤ 0.5, including those also counted in `le="0.1"`.

## Task

Export `createHistogram({ buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], now = () => performance.now() } = {})`,
returning `{ observe, startTimer, snapshot, quantile, text }`. `now()` returns
**milliseconds**; everything the histogram records is in **seconds**.

- `buckets` must be a non-empty array of finite numbers in **strictly
  increasing** order, else throw a `RangeError`. Do not sort it for the
  caller: an unsorted list is a bug in their config.
- **`observe(value)`** — `value` must be a finite number (else `RangeError`).
  It lands in every bucket whose upper bound `le >= value` (inclusive), and in
  `+Inf`.
- **`startTimer()`** returns `end()`. `end()` observes the seconds elapsed
  since `startTimer()` (from `now()`) and returns them. Calling `end()` again
  observes nothing and returns the same number.
- **`snapshot()`** → `{ buckets: [{ le, count }, …], sum, count }` —
  cumulative counts, one entry per configured bound in order, then
  `{ le: '+Inf', count }`. Return fresh objects.
- **`quantile(q)`** estimates the q-quantile the way Prometheus's
  `histogram_quantile` does. `q` outside `[0, 1]` throws a `RangeError`; no
  observations → `NaN`. Otherwise:
  1. `rank = q * count`.
  2. Find the first bucket whose cumulative count is `>= rank`.
  3. If it is the `+Inf` bucket, return the highest finite bound.
  4. Otherwise interpolate linearly inside it: its lower bound is the
     previous bucket's `le` (or `0` for the first bucket), its upper bound is
     its `le`, and the result is
     `lower + (upper - lower) * (rank - countBelow) / countInBucket`, where
     `countBelow` is the previous bucket's cumulative count and
     `countInBucket` is this bucket's count minus `countBelow`. (If
     `countInBucket` is 0 — only possible when `rank` is 0 — return the
     lower bound.)
- **`text(name)`** → the exposition lines, each ending in `\n`:

  ```
  name_bucket{le="0.1"} 3
  name_bucket{le="0.5"} 5
  name_bucket{le="+Inf"} 6
  name_sum 7.25
  name_count 6
  ```

  Bounds and numbers print with `String()`.
