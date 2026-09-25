Your service consumes billing webhooks: `subscription.created`,
`subscription.updated`, `subscription.cancelled`. Processing them one at a
time is too slow at month-end. Processing them all in parallel is wrong: a
customer's `cancelled` can finish before their `updated`, and the `updated`
handler writes the subscription back to "active". The customer keeps getting
charged.

What you need is **ordering per key, parallelism across keys**: events for
customer `cus_1` run strictly one after another in the order they arrived,
while `cus_2`'s events run alongside them — with an overall cap so month-end
does not open 5,000 database connections.

The obvious implementation is a global FIFO queue with a concurrency limit,
where a task waits if its key is busy. That has **head-of-line blocking**: if
the task at the front is waiting for `cus_1`, every other customer's task
waits behind it even though slots are free. The scheduler must skip past
tasks whose key is busy.

## Task

Export `createKeyedRunner({ concurrency = 4 } = {})` (`concurrency` must be a
positive integer, else throw a `RangeError`), returning an object with:

- **`run(key, task)`** → a promise for `task()`'s result. `task` is called
  with no arguments; a synchronous throw rejects only this promise.
- **`running`** (getter) — tasks in flight. **`pending`** (getter) — tasks
  submitted but not started.
- **`activeKeys`** (getter) — how many distinct keys currently have a task
  running or pending. It must drop back to `0` when all work is done: a
  long-running process sees millions of keys, and remembering every one of
  them is a memory leak.
- **`onIdle()`** → a promise that resolves once nothing is running or
  pending (immediately if that is already so).

Scheduling rules:

1. Tasks with the **same key** never overlap and start in the order `run`
   was called.
2. At most `concurrency` tasks run at once, across all keys.
3. Whenever a slot is free, start the **oldest** pending task whose key has
   nothing running — skipping over older tasks whose key is busy. Start as
   many as the free slots allow.
4. A task that fails does not stop later tasks for its key, or anything else.

Keys are compared with `Map` semantics (`'1'` and `1` are different keys).
