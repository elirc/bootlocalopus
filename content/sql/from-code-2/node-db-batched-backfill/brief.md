Yesterday's migration added `customers.email_normalized`. New sign-ups
fill it in; forty million existing rows are `NULL`. The obvious backfill is
one statement:

```sql
update customers set email_normalized = lower(btrim(email)) where email_normalized is null;
```

On a big table that statement is an incident. It holds row locks on every
row it touches until it finishes, so checkout's updates to those customers
wait for twenty minutes; it writes forty million new row versions at once
(table bloat, a WAL spike, replicas falling behind); and if it fails at
minute nineteen, all of it rolls back and you start again.

A production backfill is a **loop of small transactions**:

- each statement updates at most `batchSize` rows and commits on its own
  (no `BEGIN` around the loop), so locks last one batch and progress is kept;
- it walks the table with a **keyset cursor** on the primary key (`where id
  > $last … order by id limit $n`), not `OFFSET`, so every batch costs the
  same — and skipping rows that are done already makes it **idempotent**:
  kill it, rerun it, and it carries on;
- it **pauses** between batches, so replicas and real traffic keep up;
- it only fills `NULL`s: a value written by the application since the
  deploy is newer than anything the backfill would compute.

The fixture: `customers(id, email, email_normalized)`, 2,000 rows. Emails
come in mixed case and some have surrounding spaces. Every tenth customer
already has `email_normalized` set (to a value that is *not*
`lower(btrim(email))` — do not overwrite it).

## Task

`backfillNormalizedEmails(conn, { batchSize = 500, pauseMs = 0, sleep })`
sets `email_normalized = lower(btrim(email))` on every row where it is
`NULL`, and resolves to `{ updated }`: the number of rows this run changed.

1. `batchSize` must be a positive safe integer and `pauseMs` a non-negative
   safe integer, else throw a `RangeError` before any query. `sleep`
   defaults to a `setTimeout` promise; the grader passes its own.
2. Each batch is **one statement** that updates at most `batchSize` rows and
   is its own transaction. Stop when a batch finds nothing to do.
3. When `pauseMs > 0`, `await sleep(pauseMs)` between batches (not before
   the first). When it is `0`, never call `sleep`.
4. If a statement fails, let the error propagate unchanged: the batches
   already committed stay committed, and a rerun finishes the job.

## How it is graded

Through a connection with only `query`. After every statement that leaves
the connection outside a transaction, the grader counts the rows filled
since the previous commit: no commit may fill more than `batchSize` rows,
and with the default, batches of 500. The whole run may take at most
`ceil(rows / batchSize) + 2` statements. It fails the third batch on
purpose and expects exactly two batches' worth of rows to have survived,
and a rerun to report only the rest. It checks every value at the end, the
pauses, and that a run with nothing to do returns `{ updated: 0 }`.
