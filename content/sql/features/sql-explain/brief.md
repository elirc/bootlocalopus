"There is an index on `customer_id`, so it can't be the database" — and yet
the customer page for your biggest account is the slowest page in the app.
The index finds the rows. It does nothing about the other two costs:
fetching every one of them from the table, and sorting them to keep 20.

The fixture is `orders(id, customer_id, status, total_cents, placed_at)`
with 60,000 rows and one existing index, `orders_customer_id_idx` on
`(customer_id)`. Customer 42 has 6,000 orders. This is the query behind their
"recent orders" panel:

```sql
select id, placed_at, total_cents
from orders
where customer_id = 42
order by placed_at desc, id desc
limit 20;
```

And this is its `EXPLAIN (ANALYZE, BUFFERS)`, captured from the same
Postgres the grader runs:

```
Limit  (cost=749.98..750.03 rows=20 width=16) (actual time=34.989..35.075 rows=20 loops=1)
  Buffers: shared hit=442 read=7
  ->  Sort  (cost=749.98..765.11 rows=6054 width=16) (actual time=34.962..35.001 rows=20 loops=1)
        Sort Key: placed_at DESC, id DESC
        Sort Method: top-N heapsort  Memory: 18kB
        Buffers: shared hit=442 read=7
        ->  Bitmap Heap Scan on orders  (cost=71.21..588.88 rows=6054 width=16) (actual time=1.802..18.641 rows=6030 loops=1)
              Recheck Cond: (customer_id = 42)
              Heap Blocks: exact=442
              Buffers: shared hit=442 read=7
              ->  Bitmap Index Scan on orders_customer_id_idx  (cost=0.00..69.70 rows=6054 width=0) (actual time=1.632..1.634 rows=6030 loops=1)
                    Index Cond: (customer_id = 42)
                    Buffers: shared read=7
Planning Time: 1.532 ms
Execution Time: 35.446 ms
```

Read it from the innermost node outwards:

- **Bitmap Index Scan**: the index finds 6,030 matching row pointers. Cheap
  (7 buffers).
- **Bitmap Heap Scan**: then it visits **442 table pages** to fetch all 6,030
  rows, because `placed_at` and `total_cents` are not in the index.
- **Sort** (`top-N heapsort`): then it sorts all 6,030 to find the newest 20.
  The `Limit` cannot stop anything early — nothing is in order until the sort
  has seen every row.

So the work grows with the size of the customer, not with the 20 rows the page
shows. Estimated `rows=6054` against actual `rows=6030` also tells you the
statistics are fine: this is not a planner mistake, it is a missing index.

## Task

Write **one `CREATE INDEX` statement** so that this exact query is answered by
an **Index Only Scan** with **no Sort**:

- the index must **seek** on `customer_id` — the plan's scan node has an
  `Index Cond` on `customer_id`, not a `Filter` that reads the whole index;
- its key order must already match `order by placed_at desc, id desc`, so the
  `Limit` can stop after 20 entries;
- every other column the query reads must come from the index, with the
  columns that are only *returned* (not searched or sorted on) in an
  **`INCLUDE (...)`** clause rather than the key.

It must work for any customer, not only 42 — no partial index on one id.

## How it is graded

The grader runs `explain (format json)` on the query above (and on the same
query for another customer) with `set local enable_seqscan = off`, and checks:

- some node is an `Index Only Scan`, on your index, with an `Index Cond`
  mentioning `customer_id` and no `Filter`;
- no node anywhere in the plan is a `Sort` or `Incremental Sort`;
- the definition of the index the plan used (from `pg_indexes`) contains
  `INCLUDE`.

You might see `Heap Fetches` on an index-only scan in your own experiments:
Postgres still checks the table for rows whose page is not yet marked
all-visible, which `VACUUM` (and, in production, autovacuum) fixes.
