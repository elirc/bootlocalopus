```js
setInterval(async () => { await syncInventory(); }, 5_000);
```

`setInterval` does not wait for your promise. On a good day `syncInventory`
takes 2 seconds. On the day the supplier API is slow it takes 12, and a new
run starts every 5 seconds regardless: three syncs run at once, fight over
the same rows, make the supplier slower still, and the process runs out of
connections. A rejected run also becomes an unhandled rejection, and on
shutdown there is no way to wait for the run that is half done.

The fix is a **fixed delay** loop: run the task, wait for it to finish, *then*
schedule the next one. Runs can never overlap.

## Task

Export `repeat(task, intervalMs, options = {})` returning `{ stop }`.

Options: `{ timers = { setTimeout, clearTimeout }, onError }`. Schedule
**only** through `timers.setTimeout` / `timers.clearTimeout` (the tests pass
a fake).

- Do not run `task` right away: schedule the first run `intervalMs` after
  `repeat` is called.
- Each run calls `task({ signal })`. `task` may return a promise; the run is
  over when it settles. Only **then** schedule the next run, `intervalMs`
  later. There is never more than one pending timer, and never a timer
  pending while a run is in progress.
- If `task` throws or rejects, call `onError(error)` (when given) and carry
  on as normal. An error must not stop the loop, and must not become an
  unhandled rejection.
- `stop()` returns a promise:
  - it clears the pending timer, if any, and no run starts after `stop()`;
  - it aborts the `signal` that the in-progress run received, so a long
    task can give up early;
  - the promise resolves once the in-progress run (if any) has settled, so
    shutdown code can `await loop.stop()`. It never rejects, even if that
    last run fails. With nothing in progress it resolves straight away.
  - Calling `stop()` again is harmless.
