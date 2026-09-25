A chart of daily stock levels needs a point for **every** product on
**every** day. The data only has a row when stock was counted, so a naive
query draws a line straight across the days with no count, and a product
counted once in February does not appear at all in a March chart.

Gap filling has two parts:

1. **The grid.** Start from what *should* exist — every product crossed with
   every day of the range (`cross join generate_series(...)`) — and attach
   the data to it. Starting from the data can only ever return days that
   have data.
2. **Carry forward.** A stock level stays what it was until the next count:
   "last observation carried forward". For each grid cell you want the most
   recent count **on or before** that day — which may be *before the range
   starts*. Filter the counts to the range first and the first days of March
   come out empty even though you know the level.

The fixture has `products(id, sku)` and `stock_counts(product_id, counted_on
date, quantity)`, at most one count per product per day.

## Task

One query covering **2024-03-01 to 2024-03-07 inclusive**, one row per
product per day:

| column | value |
| --- | --- |
| `sku` | |
| `day` | the day, as text `'YYYY-MM-DD'` |
| `quantity` | the latest count on or before `day`; `NULL` if the product had never been counted by then |
| `is_filled` | `false` when there is a count on exactly that day, `true` otherwise (carried forward, or no data at all) |

Order by `sku`, then `day`. Every product appears, even one that has never
been counted (seven rows of `NULL`).
