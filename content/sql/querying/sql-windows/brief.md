A window function computes across a set of rows **without collapsing
them**. `GROUP BY` gives you one row per group; a window gives you every row,
each with its group's aggregate alongside.

```sql
sum(total_cents) over (partition by customer_id order by placed_at)
```

That is a running total per customer, in date order — almost. With an
`order by`, the default frame is `range between unbounded preceding and
current row`, and `range` includes every **peer**: all rows with the same
`placed_at`. Two orders on the same day both get the total *after* both. For a
true row-by-row running total, give the window a unique order (add a
tiebreaker such as the id) and say `rows between unbounded preceding and
current row`.

## Task

One query over paid orders only, returning every paid order with:

| column | meaning |
| --- | --- |
| `customer_name` | |
| `placed_at` | |
| `total_cents` | |
| `order_seq` | 1, 2, 3… per customer, oldest first; same-day orders by order `id` |
| `running_cents` | running total of that customer's paid orders up to and including this one (same order as `order_seq`) |
| `customer_total_cents` | that customer's paid total across all their orders |
| `overall_rank` | rank of this order by `total_cents` descending across the whole result (ties share a rank) |

Order by `customer_name`, then `placed_at`, then order `id`.