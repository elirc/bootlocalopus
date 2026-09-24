An inner join drops rows with no match — which is exactly wrong when the
absence *is* the question. A left join keeps them, with `NULL` on the right.

The fixture is the shop schema: `customers`, `orders`, `order_items`.

## Task

Write **one** query returning every customer, whether or not they have ordered:

| column | meaning |
| --- | --- |
| `name` | the customer's name |
| `country` | their country |
| `order_count` | number of **paid** orders (0, not null, when none) |
| `paid_cents` | total `total_cents` of their paid orders (0 when none) |

Order by `paid_cents` descending, then `name` ascending. Every one of the six
customers must appear.

Only orders with `status = 'paid'` count — and note where that condition has to
go so it does not silently turn your left join into an inner one.