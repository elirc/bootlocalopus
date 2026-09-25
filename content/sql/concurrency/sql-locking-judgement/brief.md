Most production lock incidents are not deadlocks. They are a migration that
waited politely for a report to finish while every request queued up behind
it; a foreign key insert stalled by a lock nobody thought was that strong; a
queue that "lost" jobs because `SKIP LOCKED` was used for a question that
needed an honest answer; an advisory lock that stayed held on a pooled
connection long after the job that took it had finished.

This quiz is about choosing the lock, the isolation level and the waiting
policy — and knowing what each costs.

Some facts you will need:

- Every statement takes a **table-level** lock. `SELECT` takes `ACCESS
  SHARE`; most `ALTER TABLE` forms take `ACCESS EXCLUSIVE`, which conflicts
  with everything. Lock requests are granted **in arrival order**: a waiting
  request blocks the ones behind it, even ones compatible with the current
  holder.
- **Row locks**, strongest first: `FOR UPDATE`, `FOR NO KEY UPDATE` (what a
  plain `UPDATE` that does not change a key column takes), `FOR SHARE`, `FOR
  KEY SHARE` (what inserting a row that references this one takes, via its
  foreign key).
- Waiting policies: wait (the default), `NOWAIT` (fail at once with
  `55P03`), `SKIP LOCKED` (pretend locked rows are not there), and `SET
  lock_timeout = '…'` (wait at most that long, then fail with `55P03`).
- **Advisory locks** lock a number you choose, not a row. The session-level
  kind (`pg_advisory_lock`) is held until you unlock it or the **connection**
  closes; the transaction-level kind (`pg_advisory_xact_lock`) until commit
  or rollback.
