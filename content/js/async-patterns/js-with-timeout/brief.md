"Wrap it in a timeout" usually means this:

```js
Promise.race([work(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
```

It has three bugs that each show up in production:

1. **The work keeps running.** `race` stops *waiting*; the query, the upload,
   the retry loop all carry on. The work needs an `AbortSignal` that actually
   fires on timeout.
2. **The timer leaks.** When the work wins, the 5-second timer still sits in
   the event loop. In a server doing 1,000 requests a second that is 5,000
   live timers, and in a CLI or test run it keeps the process alive.
3. **It ignores the caller's cancellation.** The request that triggered the
   work already has a signal (the client disconnected). The timeout must
   compose with it: abort on *either* — and when the work finishes, remove the
   listener you added to that long-lived parent signal, or every call leaks
   one.

Timers are injected so the grader controls time: use `timers.setTimeout` and
`timers.clearTimeout`, never the globals or `AbortSignal.timeout`.

## Task

Export a class `TimeoutError extends Error` with `name` `'TimeoutError'`, and
`withTimeout(fn, ms, { signal, timers = globalThis } = {})`:

- If `signal` is already aborted, reject with `signal.reason` and **do not
  call** `fn`.
- Otherwise call `fn(innerSignal)`, where `innerSignal` is a new signal you
  control, and return a promise of `fn`'s result.
- If `fn` settles first, settle with its result or error.
- If `ms` elapses first, create a `TimeoutError` with the message
  `` `timed out after ${ms}ms` ``, abort `innerSignal` with it, and reject
  with it — even if `fn` never settles.
- If `signal` aborts first, abort `innerSignal` with `signal.reason` and
  reject with `signal.reason`.
- A synchronous throw from `fn` is a rejection.
- **Whichever way it ends, clean up**: the timer is cleared, and any listener
  added to `signal` is removed. Later events change nothing.
