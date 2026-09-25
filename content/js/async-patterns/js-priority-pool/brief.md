A thumbnail service has one worker pool. A user who is *looking at* a page
needs its thumbnails now; the nightly re-render of 80,000 old images can wait.
With a FIFO queue, the user's request sits behind 80,000 background jobs. With
a priority pool, it jumps the queue — and when that user navigates away, their
queued jobs should vanish instead of burning CPU.

This boss pulls the chapter together: bounded concurrency, priorities, per-task
cancellation, pausing, resizing, and never letting one task's failure touch
another.

## Task

Export a class `PriorityPool`.

**Construction and state**

- `new PriorityPool({ concurrency = 1 } = {})` — `concurrency` must be a
  positive integer, otherwise throw a `RangeError`.
- `get size` — tasks queued (not started). `get running` — tasks in flight.

**Running tasks**

- `run(task, { priority = 0, signal } = {})` returns a promise of the task's
  result. `task` is called as `task(signal)` (with `undefined` if no signal
  was given) once a slot is free.
- Queued tasks start **highest `priority` first**; equal priorities start in
  the order `run` was called (FIFO). Priorities can be any number, including
  negatives.
- As soon as a task settles, its slot goes to the best queued task.
- A task that rejects or throws synchronously rejects **only its own**
  promise; the pool keeps going.

**Cancellation**

- If `signal` is already aborted, `run` rejects with `signal.reason` and the
  task never starts.
- If `signal` aborts while the task is **queued**, remove it from the queue
  and reject with `signal.reason`. Once a task has started, the pool does not
  interfere: the task sees the signal and its own promise settles however the
  task settles. Remove your abort listener once a task starts or leaves the
  queue.
- `clear(reason)` — reject every **queued** task with `reason` and empty the
  queue. Running tasks are untouched; the pool stays usable.

**Control**

- `pause()` — start no new tasks (running ones finish). `resume()` — start
  queued tasks again, up to the limit.
- `setConcurrency(n)` — same validation as the constructor. Raising it starts
  queued tasks immediately; lowering it never interrupts running tasks, it
  just starts fewer until `running` drops below the new limit.
- `onIdle()` — resolves when nothing is queued or running (immediately if
  that is already true). While paused with tasks queued, it waits.
