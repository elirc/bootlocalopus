A test for "retry with backoff after 100, 200 and 400 ms" either sleeps for
real (slow, and flaky on a loaded CI box) or uses **fake timers**:
`vi.useFakeTimers()`, `jest.advanceTimersByTime()`, `@sinonjs/fake-timers`.
Most engineers use them daily and are then baffled by the two classic
failures:

- **"The second retry never happens."** `advanceTimersByTime(1000)` fires the
  first timer synchronously. The code under test was `await`ing it, and its
  continuation, the part that schedules the *next* timer, is a microtask
  that only runs after `advanceTimersByTime` has returned. That is why
  `advanceTimersByTimeAsync` exists.
- **"runAllTimers hangs / throws."** A `setInterval` never runs out, so
  "run until nothing is left" needs a loop limit.

You are building the clock those libraries are built around. Once you have
written one, fake-timer behaviour stops being magic.

## Task

Export `createClock({ now = 0 } = {})` returning an object with:

**Time**

- `now()` — the current fake time in ms. It only moves when you `tick`.

**Scheduling** (mirrors the globals, but never touches real timers)

- `setTimeout(fn, ms = 0, ...args)` and `setInterval(fn, ms, ...args)` return
  a numeric id, unique across both, starting at 1. `fn` is called with
  `...args`. A timer is **due** at `now() + ms`.
- A `setTimeout` delay that is negative, `NaN` or missing means `0`. A
  `setInterval` delay below `1` (or not a number) means `1`, so an interval
  can never fire twice at the same instant.
- `clearTimeout(id)` and `clearInterval(id)` cancel either kind (as in Node
  and browsers). Unknown ids and `undefined` are ignored.
- `pending()` — how many timers are scheduled.

**Running**

- `tick(ms)` — advance time by `ms`, firing every timer due **at or before**
  the new time, one at a time, in order of due time (ties: in the order they
  were scheduled). While a callback runs, `now()` is **that timer's due
  time**. Timers scheduled or cleared by a callback count: one scheduled
  inside the window fires in this same `tick`. An interval is rescheduled
  for `due + interval` (so it does not drift) before its callback runs, and
  a callback may clear it. After the last timer, `now()` is the start time
  plus `ms`. Returns the number of callbacks run.
- If a callback throws, `tick` stops and rethrows it. `now()` stays at that
  timer's due time and the timers not yet run stay scheduled, so a later
  `tick` carries on.
- `tickAsync(ms)` — the same, but returns a promise, and lets **pending
  promise callbacks run** before each timer and once more at the end. After
  a timer callback resolves a promise, the code awaiting it continues before
  the next timer fires (and with `now()` still at that timer's due time), so
  timers *it* schedules count. Hint: awaiting one real macrotask (a
  `setImmediate` captured before anything could fake it) runs every pending
  microtask.
- `runAll()` — fire timers, jumping time to each one's due time, until none
  are left, and return the number run. If it has run **1000** callbacks and
  timers remain, throw an `Error` whose message contains `infinite loop`.
