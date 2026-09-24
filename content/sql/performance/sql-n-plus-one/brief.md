The N+1: fetch 50 customers, then loop and fetch each one's orders. 51
round trips, each with its own latency. The endpoint is slow and the database
looks fine, because every individual query is fast.

The fix is to ask for everything once, and let Postgres nest the results.

## Task

One query returning one row per customer who has at least one paid order:

| column | meaning |
| --- | --- |
| `name` | |
| `order_count` | how many paid orders they have |
| `recent_orders` | a **JSON array** of their up-to-3 most recent paid orders, newest first, each `{"id": …, "total_cents": …, "placed_at": "YYYY-MM-DD"}` |

Order by `name`. The JSON array must be a real JSON array (use
`json_agg`/`jsonb_agg`), not a string you assembled by hand.

The "3 most recent per customer" part is the interesting bit: a plain
`json_agg` would take all of them. A `LATERAL` join, or a window function in a
subquery, gets you the per-group limit.