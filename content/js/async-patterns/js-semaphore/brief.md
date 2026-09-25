`mapLimit` caps one batch of work. But the real constraint is usually a
*shared resource*: "no more than 5 open connections to the payments API",
across every request handler in the process. That needs a **semaphore**: a
counter of permits that callers acquire before touching the resource and give
back afterwards.

Three bugs turn a semaphore into a leak or a lie:

- **Forgetting to release on error.** One thrown exception and the permit is
  gone for good; after five failures the service deadlocks.
- **Double release.** A `finally` plus an explicit `release()` hands back two
  permits for one acquire, and your limit of 5 quietly becomes 6, then 7.
- **Barging.** If `release()` just increments a counter and wakes a waiter
  later, a brand-new caller can grab the permit first. Waiters at the back of
  the queue starve. Hand the permit **directly** to the next waiter instead.

## Task

Export a class `Semaphore`:

- `new Semaphore(permits)` — `permits` must be a positive integer; otherwise
  throw a `RangeError`.
- `acquire({ signal } = {})` — returns a promise that resolves to a
  **release function** once a permit is available. Waiters are served strictly
  in FIFO order.
  - The release function is **idempotent**: calling it a second time does
    nothing.
  - When a permit is released while callers are waiting, it goes straight to
    the first waiter: `available` stays `0`, and a caller who calls
    `acquire()` right after the release queues *behind* the existing waiters.
  - If `signal` is already aborted, reject with `signal.reason` without taking
    a permit. If it aborts while the caller is still **waiting**, remove that
    caller from the queue and reject with `signal.reason`. Aborting after the
    permit was granted has no effect.
- `use(fn)` — acquire, `await fn()`, release in every case (including a
  synchronous throw), and return `fn`'s result or rethrow its error.
- `get available` — free permits right now. `get waiting` — callers queued.
