The recommendations service slows to 10 seconds per call. Your product page
calls it on every request, so within a minute every one of your request
handlers is sitting in `await recommendations()` — and checkout, which never
touches recommendations, times out too, because there is nobody left to
serve it.

A **bulkhead** (named after the watertight compartments in a ship's hull)
gives each dependency its own small, fixed allowance of concurrent calls. When
it is used up, extra callers wait in a **short, bounded** queue — and when
that is full too, they are **rejected immediately**. A fast "no" is the whole
point: it frees the handler to serve a fallback, and it keeps the flood from
reaching the struggling dependency.

The mistakes: an unbounded queue (the bulkhead now just delays the outage),
no limit on how long a caller waits in it, and leaking a slot when the call
throws.

## Task

Export `class BulkheadFullError extends Error` and
`class QueueTimeoutError extends Error`, each setting `name` to its class
name.

Export `createBulkhead({ maxConcurrent, maxQueue = 0, queueTimeoutMs = Infinity, timers = { setTimeout, clearTimeout } })`.
Throw a `RangeError` at creation unless `maxConcurrent` is a positive integer
and `maxQueue` a non-negative integer. It returns `{ run, stats }`:

**`run(fn)`** always returns a promise — it never throws synchronously:

- If fewer than `maxConcurrent` calls are active, call `fn()` now. The promise
  settles like `fn`'s result (a synchronous throw becomes a rejection).
- Otherwise, if fewer than `maxQueue` callers are waiting, wait in the queue.
  If `queueTimeoutMs` is finite, start `timers.setTimeout(…, queueTimeoutMs)`;
  when it fires, leave the queue and reject with `QueueTimeoutError` — `fn`
  is never called.
- Otherwise reject immediately with `BulkheadFullError`; `fn` is never called.

When an active call settles, its slot goes to the **oldest** waiter (clear its
timer with `timers.clearTimeout`), which starts right away.

**`stats()`** → `{ active, queued }`.

Every bulkhead is independent: that is how one per dependency keeps a slow
one from starving the rest.
