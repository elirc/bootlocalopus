`setInterval` inside `useEffect` fails in one of two ways, depending on the
dependency array:

- `[]` — the interval keeps calling the **first render's** callback forever.
  It reads `count` from that render's closure, so a counter sticks at 1.
- `[callback]` — callers pass an inline arrow, which is a new function on every
  render, so the interval is torn down and recreated on **every render**. With
  a one-second interval and a component that re-renders more often than that,
  the callback never fires at all.

The fix is to separate the two concerns: the interval is keyed on `delay`
only, and it calls whatever callback is **latest**, read through a ref.

## Task

Export `useInterval(callback, delay)`:

- calls the latest `callback` every `delay` ms
- `delay === null` means paused: no interval is running
- a new `callback` identity must **not** clear and recreate the interval
- a new `delay` clears the old interval and starts one with the new delay
- the interval is cleared on unmount

Then export `Countdown({ from, onDone })` built on it (`from` is at least 1):

- renders `<p role="timer">{remaining}</p>`, starting at `from`, going down by
  1 every `1000` ms
- a button named `Pause` while running and `Resume` while paused; pausing
  stops the interval (delay `null`), resuming starts it again
- at `0` it stops: no interval left running, and `onDone()` is called
  **exactly once**
- `onDone` is usually an inline arrow; a parent re-render must not restart
  the countdown or call `onDone` again

The tests replace `setInterval`/`clearInterval` with a fake they tick by
hand, so use the global functions (not `window.setInterval` captured at import
time) and do not use `setTimeout` chains.
