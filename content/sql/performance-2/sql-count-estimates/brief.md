The events page says "Showing 1–50 of 48,213,907". Getting that number is
the slowest part of the page: `count(*)` in Postgres has no shortcut, it
visits every matching row (MVCC means each transaction may see a different
count). For the biggest account it is a scan of forty-eight million rows,
on every page view, to print a number nobody reads to the last digit.

The planner already has an answer: every plan carries a row estimate,
derived from table statistics, and it costs a millisecond. "About 48
million" is what the UI needed all along. For small counts, where exact
numbers do matter ("3 results"), you can count exactly and cheaply by
refusing to count past a cap.

Two places hold estimates:

- `pg_class.reltuples` is the table's estimated row count, updated by
  `ANALYZE`, `VACUUM` and `CREATE INDEX`. It is **`-1`** for a table that
  has never been analyzed or vacuumed: that means *unknown*, not zero.
- `EXPLAIN (FORMAT JSON) <query>` returns a JSON array whose first element
  has a `Plan` object with a `Plan Rows` estimate, without running the
  query. In PL/pgSQL, `execute 'explain (format json) ' || sql into plan;`
  with `plan json` captures it.

The fixture is `events(id, account_id, kind, created_at)` with 20,000 rows
(account 1 has 10,000; accounts 2–101 have 100 each), analyzed, and an
`imports` table that has never been analyzed.

## Task

Create three functions:

1. `estimated_count(p_query text) returns bigint`: the top-level `Plan
   Rows` of `explain (format json)` for the query — the estimate, never the
   true count, and without running the query. (It executes the text it is
   given: only ever pass it SQL your own code built.)
2. `table_row_estimate(p_table regclass) returns bigint`: the table's
   `reltuples`, or `NULL` when it is negative (never analyzed).
3. `account_event_count(p_account integer) returns table (count bigint,
   exact boolean)`, one row:
   - count the account's events **exactly, but never more than 1,001 of
     them** (`select count(*) from (select 1 from events where account_id =
     … limit 1001) …`); if that is at most 1,000, return `(that count,
     true)`;
   - otherwise return `(estimated_count('select * from events where
     account_id = N'), false)` — use a plain select like that, not a
     `count(*)`, whose plan estimates the one row it returns.

## How it is graded

The grader compares `estimated_count` with its own `explain (format json)`
for several queries, including one whose estimate is far from the truth,
and passes it a `DELETE` to check nothing runs. It checks
`table_row_estimate` on both tables, and again after inserting rows and
running `ANALYZE`. For `account_event_count` it uses accounts with 0, 100,
exactly 1,000, 1,001 and 10,000 events, expecting exact counts up to 1,000
and the planner's estimate for `select * from events where account_id = N`
above.
