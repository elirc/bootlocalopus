Three workers pull jobs from one table. Worker A claims "generate invoice
#812" and then its container is killed mid-job. With a plain `status =
'running'` flag, #812 stays "running" forever: nobody will ever pick it up
again, and nobody notices until the customer asks where their invoice is.

The standard fix is a **lease** (SQS calls it a visibility timeout): claiming
a job hides it only **until** a deadline. A healthy worker keeps extending
the deadline with **heartbeats**; a dead one stops, the lease expires, and
another worker claims the job.

Leases bring their own failure mode: the **zombie worker**. Worker A was not
dead, just paused by a long GC or a network partition. Its lease expired,
worker B claimed #812, and now A wakes up and calls `complete(812)` — for
work B is in the middle of redoing. A must be told it lost the job. That is
what the per-claim **token** is for: every claim gets a fresh one, and every
heartbeat, completion and release must present the token of the **current**
lease.

## Task

Export `class LeaseLostError extends Error` (`name` `'LeaseLostError'`, with a
`jobId` property) and `createJobStore({ now = Date.now, leaseMs = 30_000 } = {})`,
returning `{ add, claim, heartbeat, complete, release, get }`. Read time
only from `now()`.

- **`add(payload)`** → a new job id (`'job_1'`, `'job_2'`, …), claimable at
  once.
- **`claim(workerId)`** → the **oldest** (lowest id) claimable job, or `null`.
  A job is claimable when it is not done, its lease (if any) has expired, and
  any release delay has passed. Claiming increments the job's `attempt`
  (starting from 0, so the first claim is attempt 1), records the owner, sets
  the lease to expire at `now() + leaseMs`, and returns
  `{ id, payload, token, attempt }`. `token` is a string that is different
  for every claim ever made.
- **`heartbeat(id, token)`** extends the lease to `now() + leaseMs` and
  returns that new expiry time.
- **`complete(id, token)`** marks the job done; it is never claimed again.
- **`release(id, token, { delayMs = 0 } = {})`** gives the job back without
  completing it (the handler failed): it becomes claimable at `now() +
  delayMs`, and the lease is over.

A lease is **expired** once `now() >= expiresAt`. `heartbeat`, `complete` and
`release` throw a `LeaseLostError` — and change nothing — when the id is
unknown, the job is done, `token` is not the token of the job's latest claim,
or the lease has expired (even if nobody has re-claimed the job yet: an
expired worker must stop, because someone else may claim at any moment).

- **`get(id)`** → a snapshot `{ id, payload, state, attempt, owner }`, or
  `undefined`. `state` is `'done'`, `'leased'` (a lease that has not expired)
  or `'available'` (including a job whose release delay has not passed yet);
  `owner` is the `workerId` of the current lease, else `null`.
