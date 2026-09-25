Sending the welcome email inside the sign-up request means a slow mail
provider makes sign-up slow, and a mail outage makes sign-up fail. So the
handler **enqueues a job** and returns; a worker sends the email later and
retries if the provider is down.

The first version of that worker usually looks like this:

```js
for (let attempt = 1; ; attempt++) {
  try { return await handler(payload); }
  catch (e) { if (attempt === 3) throw e; await sleep(1000 * 2 ** attempt); }
}
```

With one worker slot, a job that fails **sleeps inside the slot**. One broken
email address now delays every other job by seconds, then minutes, and the
queue backs up behind a job that is not even running. A retry has to give its
slot back while it waits.

## Task

Export `createQueue(options)`:

```js
createQueue({
  handlers,                 // { [type]: async (payload, { id, attempt }) => void }
  concurrency = 1,          // jobs running at once
  maxAttempts = 3,          // total attempts per job, including the first
  backoff = (attempt) => 1000 * 2 ** (attempt - 1),   // ms to wait after failed attempt n
  timers = { setTimeout, clearTimeout },
})
```

It returns `{ enqueue, get, onIdle }`.

- **`enqueue(type, payload)`** returns a job id: `'job_1'`, `'job_2'`, … in
  order. If `handlers` has no own property `type`, throw a `TypeError`
  synchronously (a typo should fail at the call site, not in a worker).
- **`get(id)`** returns a snapshot `{ id, type, payload, state, attempts, lastError }`,
  or `undefined` for an unknown id. Mutating the snapshot must not affect the
  queue.
  - `state` is `'queued'`, `'running'`, `'waiting'` (backing off before a
    retry), `'succeeded'` or `'failed'`.
  - `attempts` is how many times the handler has been **started**.
  - `lastError` is the `message` of the most recent failure, or `null`.
- **`onIdle()`** returns a promise that resolves once no job is queued, running
  or waiting (immediately if that is already true).

Running jobs:

- Jobs start in FIFO order, at most `concurrency` at a time, as soon as a slot
  is free. The handler is called as `handler(payload, { id, attempt })`, with
  `attempt` starting at 1.
- A handler that resolves → `'succeeded'`.
- A handler that rejects **or throws synchronously**: if `attempts <
  maxAttempts`, the job becomes `'waiting'` and the queue calls
  `timers.setTimeout(retry, backoff(attempts))`. When that fires, the job goes
  to the **back** of the queue as `'queued'`. Otherwise it is `'failed'`.
- **A waiting job holds no slot.** Other jobs run while it backs off.
- One job failing never affects another job.

Use only `timers.setTimeout` for delays — the tests fire them by hand.
