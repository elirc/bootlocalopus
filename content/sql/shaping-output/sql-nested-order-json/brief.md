The orders endpoint loads the orders, then the customer for each, then the
lines for each: 1 + 2N queries, and the page gets slower with every order. The
database can return each order **already shaped as the API document**, so the
handler just passes it through.

The building blocks:

- `jsonb_build_object('id', o.id, 'status', o.status, ...)` — an object from
  alternating keys and values. You choose the key names, so the API can speak
  `camelCase` while the columns stay `snake_case`. A `date` value becomes the
  string `"2024-05-01"`.
- `jsonb_agg(expr order by ...)` — an array with one element per row.
- Nest them: an object whose `items` value is a `jsonb_agg` of objects.

And the three bugs every first version has:

1. **`[null]` for an order with no lines.** Aggregate over a left join and the
   "no match" row becomes a `null` element. Aggregate in a subquery (or
   `LATERAL`) instead, and remember that an aggregate over **zero rows** is
   SQL `NULL`: `coalesce(jsonb_agg(...), '[]')`, and the same for a `sum`.
2. **Unordered arrays.** Without `order by` *inside* `jsonb_agg`, the array
   comes out in whatever order the plan reads rows. It often looks right —
   until a row is updated and its new version sits at the end of the table.
   The outer query's `ORDER BY` does not reach inside an aggregate.
3. **Today's price.** `products.price_cents` is what a product costs *now*.
   An order line records what was paid in `order_items.unit_cents`.

The fixture has `customers(id, name)`, `products(id, sku, name, price_cents)`,
`orders(id, customer_id, status, placed_on date)` and `order_items(id,
order_id, product_id, qty, unit_cents)`.

## Task

One query, one row per order with `status = 'paid'`, ordered by `placed_on`
**descending**, then `id` **descending**. Columns `id` (the order id) and
`body`, a `jsonb` object with exactly these keys:

```json
{
  "id": 1,
  "status": "paid",
  "placedOn": "2024-05-01",
  "customer": { "id": 1, "name": "Ada" },
  "items": [
    { "sku": "MS-3", "name": "Mouse", "qty": 1, "unitCents": 4500, "lineCents": 4500 },
    { "sku": "CB-2", "name": "Cable", "qty": 2, "unitCents": 1500, "lineCents": 3000 }
  ],
  "totalCents": 7500
}
```

- `items` — one object per order line, **in `order_items.id` order**; `[]` when
  the order has no lines.
- `lineCents` is `qty * unitCents`; `totalCents` is the sum of `lineCents`
  (`0` when there are no lines). Numbers are JSON numbers, not strings.
