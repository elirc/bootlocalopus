Your search backend answers in 20 ms at the median and 900 ms at the 99th
percentile — not because some queries are hard, but because some *replica*
is in a GC pause, or its disk is busy, right now. A page that makes ten such
calls hits the slow tail on almost every load.

A **hedged request** attacks the tail directly: send the request, and if no
answer has come back by roughly the p95 latency, send the **same** request to
another replica. Take whichever answers first and cancel the rest. It costs
about 5% extra load and can cut the p99 dramatically. (This is from Google's
"The Tail at Scale".)

It is only for **idempotent reads** — hedging a payment is paying twice —
and it has to clean up after itself: the loser must be **aborted**, not left
running, and no timer or rejection may leak once the winner is in.

## Task

Export `hedge(fn, { delayMs, maxAttempts = 2, timers = { setTimeout, clearTimeout }, signal } = {})`.
`fn(signal, attempt)` starts one attempt (`attempt` is 1, 2, …) and returns a
promise; each attempt gets its **own** `AbortSignal` from its own
`AbortController`. `hedge` returns a promise:

- Start attempt 1 at once, and `timers.setTimeout(…, delayMs)`. Each time the
  timer fires while nothing has succeeded and fewer than `maxAttempts` have
  started, start the next attempt and set the timer again.
- An attempt that **fails** while others are still in flight changes nothing
  (the hedge is doing its job). If it fails and **none** are in flight, start
  the next attempt **immediately** (clearing and resetting the timer) if any
  remain.
- The **first success** resolves `hedge` with its value. Then abort every
  other in-flight attempt's controller, and clear the timer.
- If every attempt fails, reject with an `AggregateError` whose `errors` are
  the attempts' errors in **attempt order**.
- The caller's `signal`: if it is already aborted, reject with `signal.reason`
  without calling `fn`; if it aborts later, abort every in-flight attempt,
  clear the timer, and reject with `signal.reason`.
- Once `hedge` has settled, later results and failures are ignored — and
  must not surface as unhandled rejections. Remove the listener you added to
  the caller's signal.
