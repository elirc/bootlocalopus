Everything from this chapter in one object: bounded concurrency, per-task
promises, error isolation, and cancellation.

## Task

Export a class `TaskQueue`:

```js
const queue = new TaskQueue({ concurrency: 2 });
const p = queue.push(async (signal) => { /* work */ return 'result'; });
```

- `constructor({ concurrency = 1 })`
- `push(task)` — enqueue; returns a promise for that task's result. Tasks are
  started in FIFO order, at most `concurrency` at a time. The task receives an
  `AbortSignal`.
- One task rejecting must **not** stop the queue or reject other tasks. Only
  that task's own promise rejects.
- `get size` — queued but not started. `get running` — currently in flight.
- `onIdle()` — a promise that resolves when everything queued has finished.
  Resolves immediately if nothing is pending.
- `abort(reason)` — abort the signal given to running tasks, and reject every
  *queued* (not yet started) task with `reason`. Later `push` calls reject
  immediately.

Reject unhandled-rejection warnings from your design: every promise you create
must have a consumer.