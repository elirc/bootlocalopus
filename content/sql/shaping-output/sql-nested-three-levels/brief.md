`GET /customers/:id?include=orders.items` wants a customer, their orders,
and each order's items as one document. The obvious query joins all three
tables and aggregates — and Postgres refuses:

```
aggregate function calls cannot be nested
```

`jsonb_agg(... jsonb_agg(...) ...)` in one `SELECT` is not allowed, and it
would be wrong anyway: after the three-way join, the customer-level totals
see each order once per item. The shape that works is **one subquery per
level**, each correlated to the level above:

```sql
select jsonb_build_object(
  'id', c.id,
  'orders', (select jsonb_agg(...) from orders o
             cross join lateral (select jsonb_agg(...) from order_items oi
                                 where oi.order_id = o.id) li
             where o.customer_id = c.id)
)
from customers c where c.id = $1;
```

The inner level yields the items array for one order; the middle level
aggregates the orders (with their arrays) for one customer; the outer level
is one customer row. Each level has its own `order by` inside its aggregate
and its own `coalesce(..., '[]')` for "none".

"Not found" comes free: a `WHERE` that matches no customer returns no row,
and a scalar SQL function returning no row returns `NULL` — the handler turns
that into a 404. Returning `{}` or an empty document instead makes a missing
customer look like one with no data.

The fixture has `customers(id, name)`, `orders(id, customer_id, status,
placed_on date)` with status `'paid'` or `'cancelled'`, and
`order_items(id, order_id, sku, qty, unit_cents)`.

## Task

Create `customer_document(p_customer_id int) returns jsonb`:

```json
{
  "id": 1,
  "name": "Ada",
  "orderCount": 4,
  "lifetimeCents": 3750,
  "orders": [
    { "id": 3, "status": "paid", "placedOn": "2024-03-05", "items": [], "totalCents": 0 },
    { "id": 2, "status": "cancelled", "placedOn": "2024-03-05",
      "items": [{ "sku": "GADGET", "qty": 1, "lineCents": 5000 }], "totalCents": 5000 }
  ]
}
```

- `orders` — **all** of the customer's orders (cancelled ones too), ordered by
  `placed_on` descending, then `id` descending; `[]` when there are none.
- `items` — the order's lines in `order_items.id` order, each with `lineCents
  = qty * unit_cents`; `[]` when there are none.
- `totalCents` — the sum of the order's `lineCents` (`0` when no lines).
- `orderCount` — the number of orders (all statuses).
- `lifetimeCents` — the sum of `totalCents` over **paid** orders only (`0`
  when none).
- A customer id that does not exist returns SQL `NULL`.

All numbers are JSON numbers.
