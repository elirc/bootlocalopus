`WHERE` filters rows before grouping; `HAVING` filters groups after.
And when you need several differently-filtered aggregates in one pass,
`count(*) filter (where ...)` is cleaner than `sum(case when ... then 1 end)`.

## Task

One query, grouped by country, reporting per country:

| column | meaning |
| --- | --- |
| `country` | |
| `customers` | number of customers |
| `paid_orders` | number of orders with status `paid` |
| `pending_orders` | number with status `pending` |
| `paid_cents` | total cents of paid orders (0 if none) |
| `avg_paid_cents` | average paid order value, rounded to a whole integer (0 if none) |

Include only countries with **at least two** customers. Order by
`paid_cents` descending.