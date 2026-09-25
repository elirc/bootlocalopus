The delivery report for one district takes forty seconds on Mondays. The
plan shows a nested loop driven by `rows=1`, and `EXPLAIN ANALYZE` says the
step actually produced forty. Everything after that estimate is built on a
wrong number.

The cause is an assumption: the planner treats every column as
**independent**. For `city = 'city-7' and district = 'd-73'` it multiplies
the two selectivities — 1 in 50 cities times 1 in 500 districts — and
expects 0.8 rows out of 20,000. But a district lies in exactly one city, so
the city filter removes nothing the district filter has not already
removed: the answer is 40. The same assumption makes `group by city,
country` expect 50 × 5 = 250 groups when there are 50, because each city is
in one country. `ANALYZE` cannot fix this: its per-column statistics are
right. What is missing are statistics **across** columns.

`CREATE STATISTICS` declares them. Kinds you choose between:

- `dependencies` — "knowing column A (mostly) determines column B". Fixes
  `WHERE a = … AND b = …` estimates.
- `ndistinct` — the number of distinct **combinations**. Fixes `GROUP BY a,
  b` and `DISTINCT` estimates.
- `mcv` — the most common combinations and their frequencies. Great for
  skewed data; name the kinds you want, because with the default (all
  three) Postgres consults the MCV list first, and on uniform data like this
  it makes the filter estimate *worse*. Try it.

And like any statistics, they are empty until `ANALYZE` computes them.

The fixture is `addresses(id, customer_id, line1, district, city,
country)`, 20,000 rows: 500 districts (`d-0` … `d-499`), 10 per city (`d-73`
is in `city-7`), 50 cities, 5 countries. It has been analyzed.

## Task

Write the SQL that makes the planner's estimates right:

1. For filters on **city and district** together: within a factor of 2 of
   the real row count, for any city/district pair.
2. For **`group by city, country`**: within a factor of 2 of the real 50
   groups.

Use `CREATE STATISTICS` with explicitly named kinds (name the objects as
you like), then make sure they hold data.

## How it is graded

The grader reads `pg_statistic_ext` and `pg_statistic_ext_data` (the
objects must exist on `addresses` and have been computed), then runs `explain
(format json)` and compares the `Plan Rows` estimate with the real count:
for `city = 'city-7' and district = 'd-73'` and three other pairs, and for
the `group by city, country` aggregate.

Extended statistics describe data, they do not constrain it: a
contradictory filter (`city-7` with `d-125`, which is in `city-12`) is
still estimated at about 40 rows.
