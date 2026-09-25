This is the process that runs every background job in the company: it
claims jobs from a lease-based store, runs them a few at a time, keeps their
leases alive, retries or buries failures, and shuts down cleanly when a
deploy sends `SIGTERM`. Each of those alone is a lesson in this chapter; the
boss is making them hold **together** — a heartbeat that outlives its job, a
retry that fires after shutdown, or a claim that lands after `stop()` is
exactly the kind of bug that pages someone at 3 a.m.

## Task

Export `createWorker(options)`:

```js
createWorker({
  store,          // see below
  handlers,       // { [type]: async (payload, { id, attempt, signal }) => void }
  workerId = 'worker',
  concurrency = 2,
  pollIntervalMs = 1000,
  heartbeatMs = 10_000,
  maxAttempts = 5,
  backoff = (attempt) => 1000 * 2 ** (attempt - 1),
  isPermanent = () => false,        // (error) => boolean
  timers = { setTimeout, clearTimeout },
})
```

returning `{ start(), stop({ graceMs = 30_000 } = {}), active }` (`active` a
getter: jobs running and not yet handed back).

The `store` methods may return values or promises:

- `claim(workerId)` → `{ id, type, payload, token, attempt }` or `null`
- `heartbeat(id, token)` — throws/rejects if the lease was lost
- `complete(id, token)`, `release(id, token, { delayMs })`,
  `bury(id, token, { reason, error })` (dead-letter)

Use only `timers` for waiting. Errors thrown by `complete`, `release` and
`bury` are swallowed: the lease will expire and the job will come back.

### Claiming

- `start()` claims jobs until `active === concurrency` or `claim` returns
  `null`. Only **one** `claim` call is in flight at a time.
- When `claim` returns `null` (or rejects), wait `pollIntervalMs` with
  `timers.setTimeout` and try again. Never have more than one poll timer
  pending.
- When a job settles and a slot frees up, claim again **immediately** — do
  not wait for the poll timer.

### Running a job

- No handler for `job.type` → `bury(id, token, { reason: 'unknown-type', error })`
  (`error` a message string of your choice).
- Otherwise call `handler(payload, { id, attempt, signal })` with a fresh
  `AbortSignal`. A synchronous throw is a failure like a rejection.
- While it runs, call `store.heartbeat(id, token)` every `heartbeatMs`
  (schedule the next one after each succeeds). If a heartbeat throws, the
  lease is **lost**: abort the job's signal, stop heartbeating, and when the
  handler eventually settles, do **nothing** with the result — the job
  belongs to someone else now. Stop heartbeating as soon as the handler
  settles.
- Handler resolves → `complete(id, token)`.
- Handler fails:
  - `isPermanent(error)` → `bury(id, token, { reason: 'permanent', error: error.message })`;
  - else `attempt >= maxAttempts` → `bury(… { reason: 'max-attempts', error: error.message })`;
  - else `release(id, token, { delayMs: backoff(attempt) })`.

### Stopping

`stop({ graceMs })` returns a promise resolving to `{ released }`:

- From the moment it is called, claim nothing new and cancel the poll timer.
  If a `claim` that was already in flight returns a job, do not run it:
  `release(id, token, { delayMs: 0 })` it at once (it counts in `released`).
- If nothing is running, resolve immediately.
- Otherwise wait for running jobs to finish normally (completing, releasing
  or burying them as usual). If they have not all settled after `graceMs`
  (one `timers.setTimeout`), then for each job still running: abort its
  signal, stop its heartbeat, `release(id, token, { delayMs: 0 })` it, and
  ignore its result when it settles. Then resolve.
- `released` counts the jobs handed back by `stop`. Clear the grace timer if
  everything finished in time.
