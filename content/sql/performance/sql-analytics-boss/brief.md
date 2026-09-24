The track boss: one query, using CTEs, aggregates, a left join against a
generated month series, and window functions.

## Task

Produce a monthly revenue report covering **every month** from
`2024-01` to `2024-03` inclusive — including months with no revenue.

Count only orders with `status = 'paid'`.

| column | meaning |
| --- | --- |
| `month` | `'YYYY-MM'` |
| `orders` | paid orders that month (0 if none) |
| `customers` | distinct customers who ordered that month (0 if none) |
| `revenue_cents` | paid revenue that month (0 if none) |
| `avg_order_cents` | average paid order that month, rounded to an integer (0 if none) |
| `running_revenue_cents` | cumulative revenue from 2024-01 up to and including this month |
| `prev_month_cents` | previous month's revenue (0 for the first month) |
| `growth_pct` | percent change vs the previous month, rounded to 1 decimal. `0` when the previous month was 0 |

Order by `month` ascending.

Every month must appear even with no orders, so start from a generated series
of months and left join the data onto it — the classic reporting mistake is
starting from the orders table and silently dropping empty months.