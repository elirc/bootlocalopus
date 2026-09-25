A test starts a server, opens a database connection and makes a temp
directory. Its `afterEach` closes them in the order it opened them, with
`Promise.all`. On a good day that works. On a bad day the server is still
using the connection as it closes, the first rejection hides the second, and
the temp directory is never deleted because the step before it threw. The
next test finds the port taken and fails for no visible reason, and the one
after that reads another test's files. **Leaked state from teardown is one of
the main sources of flaky, order-dependent tests.**

The fix is the pattern behind Go's `t.Cleanup`, Node's `t.after` and
Vitest's `onTestFinished`: register each teardown **right where you create the
resource**, and run them in reverse (last in, first out), one at a time,
without letting one failure skip the rest.

## Your task

**`createCleanup()`** returns `{ defer, run }`.

- `defer(fn)` registers a step and returns a `cancel()` function that removes
  **that** registration (and does nothing if called again). If `fn` is not a
  function, `defer` throws a `TypeError` immediately.
- `run()` runs the registered steps **last-registered-first**, **one at a
  time**: it awaits each step (sync or async) before starting the next.
  - A step that throws or rejects does **not** stop the others.
  - When every step has run: if any failed, reject with an `AggregateError`
    whose `errors` are the failures **in the order they happened** and whose
    message is `` `${n} cleanup step(s) failed` ``. Otherwise resolve with
    `undefined`.
  - `run()` empties the stack, so a second `run()` does not repeat steps.
  - A step that calls `defer` during the run adds a step that runs **next**,
    in the same run.

**`withCleanup(body)`** creates a cleanup stack, awaits `body(defer)`, then
always runs the cleanups.

- If the body succeeds and the cleanups succeed, resolve with the body's
  return value.
- If the body throws, still run every cleanup, then rethrow **the body's
  error** (the same object), even if cleanups failed too.
- If only the cleanups fail, reject with their `AggregateError`.

## The trap

Two plausible designs lose steps. Iterating over a copy of the array
(`[...steps].reverse()`) misses a step deferred during the run. Cancelling by
function identity (`steps.indexOf(fn)`) removes the wrong entry when the same
function was deferred twice. Keep each registration as its own entry. And in
`withCleanup`, the body's error is what the developer needs to see: a cleanup
failure that replaces it turns "expected 3, got 2" into "port still bound".
