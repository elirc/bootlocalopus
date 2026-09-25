The welcome email went out twice. Two workers ran the same `select … where
status = 'queued' limit 10` at the same moment, got the same ten rows, and
both marked them running and sent them. Put `FOR UPDATE` on the read and
the duplicates stop, but now the second worker **waits** for the first one's
transaction and your ten workers take turns. And when a worker is killed
mid-job, its jobs stay `running` for ever.

A queue table needs three things:

- **`FOR UPDATE SKIP LOCKED`**: lock the rows you claim, and let other
  workers step over locked rows instead of waiting for them. Claim in **one
  statement** (`with next as (select … for update skip locked) update …
  from next … returning …`) or in a transaction that holds the locks until
  the `UPDATE`.
- **A lease**: a claimed job gets `locked_until = now + leaseMs`. If the
  worker has not finished by then, the job can be claimed again.
- **A fencing token**: after its lease expires, the old worker may still
  finish and try to mark the job done — overwriting the new owner's state.
  `attempts` is incremented on every claim, so it doubles as a token: only
  the holder of the current `attempts` value may complete or fail the job.

The fixture is `jobs(id, queue, payload jsonb, status, run_at, attempts,
locked_until, last_error)`, with `status` one of `queued`, `running`,
`done`, `dead`. Time is always passed in as `now` (a `Date`); never read the
clock.

## Task

1. `claimJobs(conn, { queue, limit, now, leaseMs })` resolves to an array of
   exactly `{ id, payload, attempts }` (the new `attempts`), **ordered by
   `run_at`, then `id`**. It claims up to `limit` jobs of `queue` that are
   either `queued` with `run_at <= now`, or `running` with `locked_until <=
   now` (an expired lease), oldest `run_at` first. Each claimed job becomes
   `running`, gets `attempts + 1` and `locked_until = now + leaseMs`.
   Throw a `RangeError` before any query unless `queue` is a non-empty
   string, `limit` and `leaseMs` are positive safe integers and `now` is a
   valid `Date`. `RETURNING` has no guaranteed order: sort in JavaScript.
2. `completeJob(conn, { id, attempts })`: if the job is `running` with that
   `attempts`, set it `done` with `locked_until` null and resolve to `true`;
   otherwise change nothing and resolve to `false`.
3. `failJob(conn, { id, attempts, error, now, maxAttempts, backoffMs })`,
   with the same ownership rule (not owned → change nothing, resolve to
   `null`). If `attempts >= maxAttempts`, set it `dead` and resolve to
   `'dead'`; otherwise set it `queued` with `run_at = now + backoffMs * 2 **
   (attempts - 1)` and resolve to `'retry'`. Either way clear `locked_until`
   and store `String(error)` in `last_error`. Do each in one `UPDATE` whose
   `WHERE` checks ownership.

## How it is graded

With one connection, and injected time. The grader checks which jobs are
claimed, in what order, with what lease and attempts; that lease expiry,
backoff and dead-lettering work at their boundaries (`run_at` or
`locked_until` equal to `now` counts as due); that a stale worker cannot
complete or fail a reclaimed job; and that the connection is never left in
a transaction.

It also simulates a **second worker** that claims whatever your first read
of `jobs` returned, right after that read — unless your open transaction
already holds row locks on those rows, in which case it skips them, as
Postgres would. None of its jobs may appear in your result or be claimed
twice. Because a single connection cannot show one worker skipping
another's locks, the grader also checks that one of your statements says
`FOR UPDATE SKIP LOCKED` (comments are ignored).
