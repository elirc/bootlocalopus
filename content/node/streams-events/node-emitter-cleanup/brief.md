Every `emitter.on(...)` is a reference from a long-lived object to your
callback — and to everything the callback closes over. Add one per request
and never remove it, and after a day the process holds a million closures
and prints `MaxListenersExceededWarning: Possible EventEmitter memory leak
detected`. The warning is the *symptom*; raising `setMaxListeners` just hides
it.

Leaks hide in the exits. The happy path usually removes its listeners; the
early `break`, the timeout, the error and the client that disconnected do
not. And async iterators add one more exit that surprises people: calling
`return()` on an async generator that has **not started yet** never runs its
body — including its `finally`.

## Task

A job queue emits three events on a shared `EventEmitter`:

- `'progress'` with `{ jobId, percent }`
- `'done'` with `{ jobId }`
- `'failed'` with `{ jobId, error }` (an `Error`)

Export `function watchJob(emitter, jobId, { signal } = {})`. It **subscribes
immediately** (an event emitted right after the call, before anyone iterates,
must not be lost) and returns an **async iterable** — something you can
`for await` over — that:

- yields each `percent` for **this** `jobId`, in order, ignoring other jobs,
  and never drops events that arrive faster than the consumer reads them;
- **finishes** (the loop ends normally) after this job's `'done'`;
- **throws** this job's `error` after its `'failed'`;
- **throws** `signal.reason` if `signal` aborts (immediately, if it is
  already aborted when iteration starts).

In **every** one of those cases — and when the consumer leaves early
(`break`, or calling `return()` on the iterator, even before the first
`next()`) — all listeners it added are removed: nothing left on the emitter's
`'progress'`, `'done'` and `'failed'`, and nothing left on the signal's
`'abort'`. The tests count listeners with `emitter.listenerCount(name)` and
`getEventListeners(signal, 'abort')` from `node:events`.
