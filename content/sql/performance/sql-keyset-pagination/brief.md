`LIMIT 20 OFFSET 20000` makes the database find 20,020 rows and discard
20,000 of them. It also skips or repeats rows when data is inserted between
requests.

**Keyset** (or cursor) pagination asks for "the next 20 after *this* row",
which an index can jump straight to.

The trick is the tie-break: ordering by a non-unique column needs a second,
unique column, and the comparison has to treat the pair as a tuple.

## Task

The fixture has `events(id, occurred_at, kind)`, with **deliberate duplicate
timestamps**.

Write one query returning the page of 3 events immediately **after** the cursor
`(occurred_at = '2024-01-02 10:00:00+00', id = 4)`, newest first.

- order by `occurred_at` descending, then `id` descending
- return `id`, `occurred_at`, `kind`
- exactly 3 rows, and no row from the cursor's page repeated
- use a **row-value comparison** — `(a, b) < (x, y)` — not `OFFSET`, and not
  `occurred_at <= x AND id < y` (which drops rows across a timestamp boundary)