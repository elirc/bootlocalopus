"Refresh the exchange-rate cache every minute" starts life as
`setInterval(refresh, 60_000)`. Then the rates API has a slow day:

- A refresh takes 70 seconds, so the next one **starts while the first is
  still running**. Two refreshes race; the older response can land last and
  overwrite the newer one. On a really slow day they pile up.
- Someone "fixes" that with `setTimeout(tick, 60_000)` at the **end** of each
  run. Now nothing overlaps, but the schedule **drifts**: a run that takes 10
  seconds pushes every later run 10 seconds back, and "every minute on the
  minute" becomes "whenever".
- One refresh throws, nobody catches it, and the loop is dead until the next
  deploy.
- On shutdown, the process exits in the middle of a run.

A small scheduler fixes all four: **fixed-rate** ticks computed from the
schedule (not from when the last run finished), **skip a tick** while the
previous run is still going, errors reported and survived, and a `stop()` that
waits for in-flight work.

## Task

Export `createScheduler({ now = Date.now, timers = { setTimeout, clearTimeout }, onError = () => {} } = {})`,
returning `{ every, stats, stop }`.

**`every(name, intervalMs, task)`** schedules `task()` (sync or async).

- `intervalMs` must be a positive integer, else throw a `RangeError`. A name
  already scheduled, or calling `every` after `stop()`, throws an `Error`.
- The first tick is due at `start + intervalMs`, where `start` is `now()` when
  `every` was called — not immediately. Tick *k* is due at
  `start + k * intervalMs`.
- Wait for a tick with `timers.setTimeout(fn, due - now())` (never a negative
  delay). Read time only from `now()`.
- When a tick fires:
  - if this task's previous run has not settled, **skip** it (no second
    concurrent run) and count it;
  - otherwise start a run.
- Either way, schedule the **next due tick after `now()`**. Due times stay on
  the original grid (`start + k * intervalMs`): a slow run never shifts later
  ticks, and a timer that fires very late (a laptop waking from sleep) causes
  **one** run, not a burst of catch-up runs for every missed tick.
- A run that throws synchronously or rejects calls `onError(name, error)`;
  the schedule carries on.

**`stats(name)`** returns `{ runs, skipped, failures }` for that task: runs
started, ticks skipped because a run was still in progress, and runs that
failed.

**`stop()`** cancels every pending timer (with `timers.clearTimeout`) so no
new runs start, and returns a promise that resolves once every in-flight run
has settled.
