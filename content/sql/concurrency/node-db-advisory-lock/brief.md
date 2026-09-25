The nightly invoicing job runs from a scheduler inside the app, and the app
now runs on three servers. On the first night after the scale-out every
customer got three invoices. There is no row to lock — the job is about to
*create* the rows — so `FOR UPDATE` has nothing to hold on to.

An **advisory lock** is a lock on a number you choose. Postgres does not
care what it means; everyone who agrees on the number is excluded by it.
Two decisions matter:

- **Try, don't wait.** `pg_try_advisory_xact_lock(key)` answers `true` or
  `false` immediately. A scheduler that waits for the lock would just run
  the job again after the first server finishes.
- **Transaction-level, not session-level.** `pg_advisory_lock` belongs to the
  *connection* until you unlock it; forget the unlock on an error path, or
  unlock on a different pooled connection, and the job silently never runs
  again. The `_xact_` variant is released by `COMMIT` or `ROLLBACK`, always.

The key is a `bigint`. `hashtext($1)` turns a name into an integer inside
the database; in production you would pick a documented scheme (a constant
per job, or the two-integer form `(namespace, id)`) so names cannot collide.

And one thing a lock can never do: it stops two runs **overlapping**, not a
second run **after** the first one finished. For that you need a durable
record — here, a row in `invoice_runs`.

The fixture: `subscriptions(id, customer, price_cents, active)` — ada 1200,
bob 900, dee 2400 active, cy inactive; `invoices(id, subscription_id, day,
amount_cents)`, unique on `(subscription_id, day)`; and `invoice_runs(day
primary key, invoiced, finished_at)`.

## Task

1. `runExclusive(conn, name, work)`:
   - `name` must be a non-empty string, else throw a `RangeError` before any
     query.
   - Open a transaction and try to take the advisory lock for `name`,
     without waiting. Not acquired → end the transaction, don't call `work`,
     resolve to exactly `{ ran: false }`.
   - Acquired → `const result = await work(conn)`, commit, resolve to `{ ran:
     true, result }`. The lock is held until the commit.
   - If `work` throws, roll back and rethrow the **same** error. The lock must
     be released on every path, and the connection never left in a
     transaction.
2. `runDailyInvoicing(conn, day)` (`day` is `'YYYY-MM-DD'`) calls
   `runExclusive(conn, 'daily-invoicing', …)`, and inside it:
   - if `invoice_runs` already has `day`, resolve to `{ status:
     'already-ran' }`;
   - otherwise insert one invoice per **active** subscription (amount =
     `price_cents`), then the `invoice_runs` row with the number invoiced, and
     resolve to `{ status: 'ran', invoiced: n }`.
   - If the lock was not acquired, resolve to `{ status: 'locked' }`.

## How it is graded

Through a connection with only `query`. While `work` runs, the grader reads
`pg_locks` and expects your connection to hold an advisory lock, a different
one per name, the same one for the same name; afterwards, none. It plays
another server holding the lock by making every `pg_try_advisory_*` call
answer `false` (a blocking `pg_advisory_lock` would ignore it, and fail the
test). It injects a failure just before the `invoice_runs` insert and
expects no invoices for that day to survive.
