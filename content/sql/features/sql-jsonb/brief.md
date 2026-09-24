A `payload jsonb` column starts as "we'll just store the event". Six months
later somebody searches it with `payload::text like '%KB-1%'`, which scans
every row and also matches `KB-10` and a customer's free-text note; somebody
else writes `"items": "KB-1"` instead of an array and every report that
unpacks `items` falls over.

JSONB is fine. Unqueried, unconstrained, unindexed JSONB is the problem.

The fixture is `events(id serial, payload jsonb not null, received_at)` with
eight order events shaped like this:

```json
{
  "type": "order.placed",
  "order_id": 1001,
  "customer": { "id": 7, "country": "GB" },
  "coupon": "SPRING",
  "items": [
    { "sku": "KB-1", "qty": 1, "unit_cents": 9000 },
    { "sku": "CB-2", "qty": 2, "unit_cents": 1500 }
  ]
}
```

`coupon` may be absent or JSON `null`. `items` is always an array (possibly
empty) — for now.

## Task

Write these statements, in this order. The **last** statement must be the
query; the grader reads its rows.

1. **Constrain the shape.** Add a `CHECK` constraint so that every row's
   `payload->'items'` is a JSON **array**. A string, an object, JSON `null`
   and a **missing** `items` key must all be rejected; `[]` is fine.
2. **Promote the hot key.** Add a column `event_type text` that is
   `GENERATED ALWAYS AS (payload->>'type') STORED`, and a B-tree index on it.
   It stays in sync on insert and on update without anyone remembering to.
3. **Index the document.** Add a **GIN** index on `payload` using the
   **`jsonb_path_ops`** operator class, so containment (`@>`) queries use it.
4. **Query it.** One row for every **`order.placed`** event whose `items`
   contain an item with `sku` exactly **`KB-1`**:

| column | type | meaning |
| --- | --- | --- |
| `id` | int | the event id |
| `order_id` | int | `payload.order_id` |
| `customer_id` | int | `payload.customer.id` |
| `coupon` | text | the coupon code, or `NULL` when absent or JSON `null` |
| `total_cents` | int | the sum of `qty * unit_cents` over **all** the order's items |
| `bulk` | boolean | `true` when **any** item has `qty >= 3` — use `jsonb_path_exists` |

Order by `id`. Cancellations, `KB-10`, and a `KB-1` that only appears in a
note must not match.

## How it is graded

Your rows are compared value by value. Then, with `set local enable_seqscan =
off`, the grader explains its own containment query
(`payload @> '{"items": [{"sku": "KB-1"}]}'`) and expects the plan to use a
GIN index whose definition (in `pg_indexes`) names `jsonb_path_ops`. It checks
`information_schema.columns` says `event_type` is generated, inserts and
updates rows to see it follow the payload, and inserts badly shaped payloads to
see your CHECK reject them.

Worth knowing: `jsonb_path_ops` serves `@>`, `@?` and `@@`, but not the key
operators `?`, `?|`, `?&` (the default `jsonb_ops` does, at a larger index).
And the *function* `jsonb_path_exists(…)` is never index-assisted — its
operator twin `payload @? '$.items[*] ? (@.qty >= 3)'` can be.
