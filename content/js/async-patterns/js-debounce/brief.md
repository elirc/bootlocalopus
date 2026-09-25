A search box that fires a request per keystroke sends eight requests for
"keyboard" and renders whichever answer lands last — often the one for "keyb".
A resize handler that re-lays out the page 60 times a second jank-locks it.
**Debounce** collapses a burst of calls into one: wait until the calls stop for
`wait` ms, then run once with the latest arguments.

The copy-pasted five-line debounce gets the edge cases wrong:

- it runs with the **first** call's arguments instead of the last;
- it loses `this`, so `input.onchange = debounce(this.save, 300)` saves `undefined`;
- with `leading: true` *and* `trailing: true`, a single click runs the
  function **twice**;
- there is no `cancel()` for when the component unmounts, and no `flush()` for
  "save now, the tab is closing".

Timers are injected so the grader controls time: use `timers.setTimeout` and
`timers.clearTimeout`, never the globals directly.

## Task

Export `debounce(fn, wait, options)` with
`options = { leading = false, trailing = true, timers = globalThis }`.
It returns a function `debounced(...args)`:

- Every call (re)starts a `wait`-ms timer. A **burst** is a run of calls with
  less than `wait` ms between them; it ends when the timer fires.
- `trailing: true` — when the burst ends, call `fn` once with the **last**
  call's arguments and `this`.
- `leading: true` — call `fn` immediately on the **first** call of a burst.
  With both options on, the trailing call happens only if the burst had **more
  than one** call.
- `debounced(...)` returns `undefined`.

And attach two methods:

- `debounced.cancel()` — drop any pending trailing call; the next call starts
  a fresh burst.
- `debounced.flush()` — if a trailing call is pending, run it **now**, clear
  the timer, and return `fn`'s result; otherwise return `undefined`. After a
  flush the burst is over.
