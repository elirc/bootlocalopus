"There's an index on `created_at`, so it can't be this query." It can.
`where created_at::date = '2024-01-15'` asks Postgres to compute
`created_at::date` for **every row** and compare the result; the index is
sorted by `created_at`, not by that expression, so it cannot help. The same
happens to `total_cents / 100.0 > 50`, to `coalesce(status, 'new') =
'new'`, and to `extract(year from created_at) = 2023`. Each one returns the
right rows and reads the whole table to find them.

A predicate the index can search is called **sargable**: the indexed
column stands **alone** on one side of the operator, and all the functions
and arithmetic move to the constant side. Usually that means turning a
function of the column into a **range** of the column.

The traps are on the edges. A day is `>= midnight and < next midnight` —
`between` includes the next midnight. "More than £50.00" is `> 5000` cents;
integer division (`total_cents / 100 > 50`) quietly drops 5001–5099. And an
expression index on `created_at::date` is not even allowed: for a
`timestamptz` the date depends on the session time zone.

The fixture is `orders(id, customer_id, status, total_cents, created_at
timestamptz)` — about 4,000 rows, with some deliberate edge cases — and
three indexes: `orders_created_at_idx`, `orders_total_cents_idx`,
`orders_status_idx`. `status` is `NULL` for orders imported before statuses
existed. All times are UTC.

## Task

The starter creates four views. Recreate each with the **same columns**
(`id, customer_id, total_cents, created_at`) and the **same meaning**, but
a `WHERE` clause the existing index can search:

| view | meaning | index it must use |
| --- | --- | --- |
| `orders_on_day` | placed on 15 January 2024 | `orders_created_at_idx` |
| `big_orders` | total over £50.00 (more than 5000 cents) | `orders_total_cents_idx` |
| `unprocessed_orders` | status `'new'` or no status | `orders_status_idx` |
| `orders_2023` | placed in the year 2023 | `orders_created_at_idx` |

Do **not** create or drop indexes. The point is that the ones you have were
enough.

## How it is graded

For each view the grader compares its ids with a reference query, including
edge rows at midnight, at the last microsecond of a day and year, at 5000,
5001 and 5099 cents, and with a `NULL` status; then inserts new edge rows
and checks again. It runs `explain (format json) select id from <view>`
with `enable_seqscan` off — so an index is used whenever one *can* be — and
expects no `Seq Scan` and a scan on the named index. It also checks that
`orders` has exactly its original four indexes.
