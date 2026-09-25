`GET /customers/:id/orders?limit=&before=` is the mobile app's busiest
endpoint. Today it runs one query for the customer, one for the page of
orders, one per order for items, one per order for tags, and one `count(*)`
for the total — and pages with `OFFSET`, so a new order arriving while the
user scrolls shows them the same order twice. Replace all of it with **one
SQL function returning the finished response body**.

It needs the whole chapter, plus one thing from pagination: to know whether a
next page exists, fetch **one row more** than the page size. If the extra row
comes back there is a next page; a page that is merely full proves nothing
(the last page is often exactly full).

The fixture has `customers(id, name)`, `orders(id, customer_id, status,
placed_on date)` where `status` is `'draft'`, `'paid'`, `'shipped'` or
`'cancelled'`, `order_items(id, order_id, sku, qty, unit_cents)` and
`order_tags(order_id, tag)`.

## Task

Create `orders_page(p_customer_id int, p_limit int, p_before_id int) returns
jsonb`. For a customer that does not exist it returns SQL `NULL`. Otherwise:

```json
{
  "customer": { "id": 1, "name": "Ada" },
  "orders": [
    {
      "id": 7,
      "status": "paid",
      "placedOn": "2024-03-20",
      "items": [
        { "sku": "GIZMO", "qty": 1, "lineCents": 7500 },
        { "sku": "BOLT", "qty": 8, "lineCents": 2000 }
      ],
      "tags": ["gift", "priority"],
      "totalCents": 9500
    }
  ],
  "page": { "limit": 2, "nextBefore": 5, "totalOrders": 5 }
}
```

**Which orders.** The customer's orders except **drafts**, newest first by
`id` **descending**. When `p_before_id` is not null, only orders with
`id < p_before_id` (keyset pagination: the client passes back `nextBefore`).

**The limit.** `p_limit` null means 20; values below 1 become 1 and values
above 50 become 50. `page.limit` reports the limit actually used.

**Each order.**

- `items` — its lines in `order_items.id` order, `lineCents = qty *
  unit_cents`; `[]` when none.
- `tags` — its tags as an array of strings, alphabetical; `[]` when none.
  Items and tags are two independent one-to-many relationships: joined
  together they multiply each other.
- `totalCents` — the sum of its `lineCents`, `0` when none.

**The page.**

- `nextBefore` — the `id` of the last order on this page **if more orders
  exist after it** (with the same filters), otherwise `null`.
- `totalOrders` — the customer's non-draft orders across all pages.

A customer with no orders gets `"orders": []`, `nextBefore: null` and
`totalOrders: 0`. All numbers are JSON numbers.
