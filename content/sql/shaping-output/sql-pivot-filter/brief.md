Finance wants the quarter as a spreadsheet: one row per region, one column
per month. `GROUP BY region, month` gives one row per region *per month*,
and the usual next step is to pivot in application code or in Excel — where
a region with no February sales has no February row, so its figures slide
one column to the left.

Pivot in the query with **filtered aggregates**: the same aggregate once per
column, each over its own subset of the rows.

```sql
sum(amount_cents) filter (where sold_on >= '2024-01-01' and sold_on < '2024-02-01') as jan_cents
```

(The `tablefunc` extension's `crosstab` exists, but it needs the column list
spelled out anyway, is not installed on most managed databases, and is
harder to read. `FILTER` is standard SQL.)

The traps:

- **`extract(month from sold_on) = 1`** is January of *every* year. Use
  half-open date ranges (`>= first day and < first day of next month`), which
  carry the year and get month ends and leap days right with no arithmetic.
- **`NULL`, not `0`.** `sum` over no rows is `NULL`. A spreadsheet cell and a
  chart want `0`: `coalesce(..., 0)`.
- **The vanishing region.** Every region gets a row, so start from `regions`
  and left join `sales`. Then restrict to the quarter **in the join
  condition**: `where sold_on >= ...` runs after the join and throws away the
  `NULL` rows that stand for "no sales", turning the left join back into an
  inner one.

The fixture has `regions(code, name)` and `sales(id, region_code, sold_on
date, amount_cents)`, with sales on both sides of the quarter.

## Task

One query for **Q1 2024** (1 January to 31 March 2024 inclusive), one row per
region — including regions with no sales in the quarter:

| column | value |
| --- | --- |
| `region` | the region's `name` |
| `jan_cents`, `feb_cents`, `mar_cents` | the sum of `amount_cents` in that month of 2024; `0` when none |
| `q1_cents` | the sum over the quarter; `0` when none |
| `sales` | the number of sales in the quarter |

All five number columns are integers. Order by `q1_cents` descending, then
`region` ascending.
