The finance export wants revenue per region and product, a subtotal per
region, and a grand total, in one table. The usual approach is three queries
glued with `union all`, which scans the data three times and drifts the day
someone edits one branch and not the others.

`GROUP BY ROLLUP (region, product)` produces all three levels in one pass:
the `(region, product)` rows, a `(region)` subtotal per region with `product`
set to `NULL`, and a `()` grand total with both `NULL`. (`GROUPING SETS` lets
you list the levels explicitly; `CUBE` gives every combination.)

The trap is that `NULL`. The data has sales with **no region** (region
unknown), and in the output those look exactly like subtotal rows. Labelling
with `coalesce(region, 'All regions')` merges "unknown region" into the grand
total label. `grouping(region)` is the honest test: it is `1` when the row is
aggregated *over* region, and `0` when `region` is a real (possibly null)
group value.

The fixture has `sales(id, region, product, units, revenue_cents)`;
`region` is nullable.

## Task

One query using `ROLLUP` (or `GROUPING SETS`) — not `union` — returning:

| column | value |
| --- | --- |
| `region` | the region; `'unknown'` for sales with no region; `'All regions'` on the grand total row |
| `product` | the product; `'All products'` on subtotal and grand total rows |
| `units` | sum of `units` (an integer) |
| `revenue_cents` | sum of `revenue_cents` (an integer) |

Order: regions alphabetically by their label (`'unknown'` included in that
order), each region's products alphabetically followed by its
`'All products'` subtotal row, and the grand total row last.

Sort on the `grouping(...)` values and the underlying columns rather than on
the labels, or `'All products'` sorts before `'Keyboard'`.
