`await new Promise((r) => setTimeout(r, 1100))` in a test is two bugs in
one. Pick a sleep long enough for CI on a busy day and the suite takes
minutes. Pick one short enough to be pleasant and it fails whenever the laptop
is under load. Tests of time-based code should not wait for real time. They
should **control** it.

Both functions here take their timing as a parameter, which makes that
possible. `retry` takes a `sleep`. `debounce` takes `setTimeout` and
`clearTimeout`. In your tests, pass a `sleep` that records the delay and
resolves at once, and a fake scheduler whose clock you move forward by hand.

## What they promise

**`retry(fn, { attempts = 3, delayMs = 1000, sleep })`**

- Calls `fn(attempt)` (attempt is 1, 2, 3…) until its promise **resolves**,
  and resolves to that value. A rejection counts as a failure, whether the
  promise rejects or `fn` throws.
- Makes **at most `attempts` calls in total** (not `attempts` retries).
- Between attempts it awaits `sleep(ms)`: `delayMs`, then `2 × delayMs`, then
  `4 × delayMs`…
- After the last failure it rejects with **the last error**, straight away,
  **with no sleep after the final attempt**.

**`debounce(fn, ms, { setTimeout, clearTimeout })`**

- Returns a function. Calling it any number of times in a burst results in
  **one** call to `fn`, `ms` after the **last** call of the burst, with the
  **last** call's arguments (the trailing edge).
- Nothing is called before that. A call `ms` after the burst has gone quiet
  starts a new burst.

## Your task

Write a test file that uses `describe` / `it` / `expect` against the global
`solution` (also available as `subject`).

- Write **at least 6 tests**. Each one must make an assertion.
- **Every test has a 400 ms limit.** The default delays are 1 s, 2 s, and so
  on, so any test that really sleeps times out. Inject `sleep` and the
  scheduler.
- The suite must pass against a **rewrite that behaves the same**: a
  recursive `retry`, and a `debounce` that **never calls `clearTimeout`**
  (it ignores stale timers instead). Do not assert how many timers were set
  or cleared. Assert when `fn` ran and with what.
- Four planted bugs must each make at least one of your tests fail.

## The trap

For `retry`, a `fn` that always succeeds or always fails shows almost nothing.
Use one that fails a set number of times and then succeeds, and record every
call to `fn` and to `sleep`. For `debounce`, check that `fn` has **not** been
called before the quiet period ends as well as that it has been called after.
A debounce that fires at the start of the burst passes any test that only
looks at the end.
