Orders are placed in euros and dollars; finance reports in pounds, at the
exchange rate **in effect when the order was placed**. Rates are published
irregularly — whenever they move — so there is no row per day to join on
equality. What you need for each order is "the most recent rate at or before
this moment": an **as-of join**.

A plain join cannot say "the latest one"; a correlated subquery can return
only one column. `LATERAL` lets a subquery in the `FROM` clause refer to
columns of the tables before it, so it runs once per outer row and can use
`order by ... limit 1` and return as many columns as you like:

```sql
from orders o
left join lateral (
  select r.rate_micros, r.effective_at
  from fx_rates r
  where r.currency = o.currency and r.effective_at <= o.placed_at
  order by r.effective_at desc
  limit 1
) rate on true
```

`left join lateral ... on true` keeps the order even when the subquery finds
nothing; `cross join lateral` would silently drop it. With an index on
`(currency, effective_at)` this is one index probe per order.

The fixture has `orders(id, currency, amount_cents, placed_at)` and
`fx_rates(currency, effective_at, rate_micros)`, where `rate_micros` is how
many **millionths of a pound** one unit of the currency is worth (1 EUR =
0.853 GBP is `853000`).

## Task

One query, one row per order, ordered by `order_id`:

| column | value |
| --- | --- |
| `order_id` | |
| `currency` | |
| `amount_cents` | |
| `rate_effective_at` | `effective_at` of the rate used; `NULL` for GBP orders and for orders placed before any rate for their currency |
| `gbp_cents` | `amount_cents` converted at that rate, rounded to the nearest integer, as an `int`; for `GBP` orders, `amount_cents` unchanged; `NULL` when there is no rate |

The rate in effect is the one with the greatest `effective_at` **at or
before** `placed_at` — a rate published at exactly the order's time applies to
it.

Mind the arithmetic. Both columns are `int`, so `amount_cents * rate_micros`
is computed in `int` and overflows (`integer out of range`) past about 2.1
billion — €100.00 at 853000 is already 8.5 billion. Cast first:
`round(amount_cents::numeric * rate_micros / 1000000)` does all of it in
`numeric`, so nothing overflows and nothing is lost to integer division.
