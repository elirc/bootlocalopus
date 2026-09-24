The payments provider starts timing out. Every request to your checkout now
holds a connection for 30 seconds waiting for it, the pool runs dry, and your
**whole** site goes down because **one** dependency is slow. The provider
recovers after two minutes; your service, still hammering it with retries,
takes twenty.

Three tools stop that cascade, and this boss is all three:

- **A timeout per call**, so a hung dependency costs you a bounded wait, not a
  connection forever.
- **A fallback**, so a failure degrades one feature ("recommendations
  unavailable") instead of the page.
- **A circuit breaker**: after enough consecutive failures, stop calling the
  dependency at all for a while — fail instantly — then let **exactly one**
  trial request through to see whether it has recovered.

```
           threshold consecutive failures
  CLOSED ─────────────────────────────────▶ OPEN
    ▲                                        │  a call arrives after resetTimeoutMs
    │ probe succeeds                         ▼
    └──────────────────────────────────── HALF-OPEN ──▶ probe fails ──▶ OPEN
```

## Task

Export `class CircuitOpenError` and `class TimeoutError` (both extend `Error`,
with `name` set to the class name), and

```js
createBreaker(fn, {
  failureThreshold = 5,
  resetTimeoutMs = 30_000,
  callTimeoutMs = 5_000,
  fallback,                    // optional: (error, ...args) => value or promise
  isFailure = () => true,      // which errors count against the dependency
  onStateChange = () => {},    // (from, to)
  now = Date.now,
  timers = { setTimeout, clearTimeout },
} = {})
```

returning `{ call(...args), state, failures }` (`state` and `failures` are
getters). The breaker has no timers of its own besides the per-call timeout,
and reads time only from `now()`.

**`call(...args)` always returns a promise** — it never throws synchronously,
even if `fn` does.

**Closed** (the initial state): call `fn(...args)`, racing it against
`timers.setTimeout(…, callTimeoutMs)`.

- Resolves → that value; `failures` resets to 0. Clear the timer
  (`timers.clearTimeout`) as soon as the call settles.
- Rejects (or throws) with an error where `isFailure(error)` is true, or times
  out → `failures` goes up by one; when it reaches `failureThreshold` the
  breaker goes **open**. A timeout fails the call with a `TimeoutError` and
  always counts.
- Rejects with an error where `isFailure(error)` is false (say, a 404: the
  dependency is healthy, the thing just does not exist) → it counts as a
  **success** for the breaker (resets `failures`, closes a half-open circuit),
  and the call rejects with that error — **without** the fallback.

**Open**: calls fail at once with a `CircuitOpenError` and `fn` is **not
called** — until a call arrives when `now() - openedAt >= resetTimeoutMs`. That
call moves the breaker to **half-open** and becomes the probe.

**Half-open**: the probe calls `fn` (with the same timeout). While it is in
flight, every other call fails at once with `CircuitOpenError`. The probe
succeeding closes the breaker (`failures` back to 0); the probe failing
re-opens it with a fresh `openedAt`.

**Stale results are ignored**: a call admitted while closed that settles after
the breaker has opened must not change anything (a late success does not
close an open circuit; a late failure does not extend it). A result that
arrives after its own timeout fired is likewise ignored, and must not cause an
unhandled rejection.

**Fallback**: whenever a call fails because of a counted failure, a timeout
or an open circuit, and `fallback` was given, the call resolves with
`await fallback(error, ...args)` instead of rejecting. If the fallback itself
throws, the call rejects with the fallback's error.

**`onStateChange(from, to)`** is called on every transition, with the states
spelled `'closed'`, `'open'` and `'half-open'`.
