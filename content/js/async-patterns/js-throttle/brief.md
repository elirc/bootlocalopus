Debounce waits for silence, so during a continuous scroll it never fires at
all. A scroll-position tracker, a "user is typing…" presence ping or a
progress bar wants the opposite: **at most one call per `wait` ms, for as long
as the calls keep coming** — that is a throttle.

The one-liner throttle is

```js
if (Date.now() - last >= wait) { last = Date.now(); fn(...args); }
```

and it has a nasty bug: every call inside the window is **dropped**. When the
user stops scrolling 40 ms into a window, the final position is never
reported, and the UI stays wrong until they scroll again. A correct throttle
remembers the latest call made during the window and delivers it when the
window closes.

Timers are injected so the grader controls time: use `timers.setTimeout` and
`timers.clearTimeout`, never the globals.

## Task

Export `throttle(fn, wait, { timers = globalThis } = {})`, returning
`throttled(...args)`:

- A call when no window is open runs `fn` **immediately** (with that call's
  arguments and `this`) and opens a `wait`-ms window.
- Calls made while a window is open do not run `fn`; only the **latest** one's
  arguments and `this` are kept.
- When a window closes: if a call was kept, run `fn` with it **and open a new
  window** (so two runs are never less than `wait` ms apart). If nothing was
  kept, the throttle goes idle and the next call runs immediately again.
- `throttled(...)` returns `undefined`.
- `throttled.cancel()` — drop any kept call and close the window, so the next
  call runs immediately. No timer may be left running.
