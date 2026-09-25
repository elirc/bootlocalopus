A batch loader (DataLoader and friends) hands the database a list of ids and
expects back **one result per id, in the same order** — including a
placeholder for ids that do not exist, and a repeat for ids asked for twice.
`where id = any($1)` gets none of that right: it returns rows in whatever
order the plan produces, drops missing ids, and collapses duplicates. The
application then has to re-sort and fill the holes, and the classic bug is a
missing id shifting every later result onto the wrong key.

Postgres can do it in the query. `unnest($1::int[]) with ordinality` turns
the array into rows **with their 1-based position**, and a `left join` onto
the table keeps every requested id:

```sql
select req.pos, req.id, p.name
from unnest(array[7, 3, 7]) with ordinality as req(id, pos)
left join products p on p.id = req.id
order by req.pos;
```

Passing a whole list as one array parameter is also how you avoid building
`in ($1, $2, …, $500)` strings — one statement, one plan, any length.

The fixture has `products(id, name, price_cents)` with ids 1–5.

## Task

Create a function

```sql
products_by_ids(p_ids int[])
returns table (pos int, id int, name text, price_cents int, found boolean)
```

returning **one row per element of `p_ids`, in array order**:

- `pos` — the element's 1-based position in `p_ids`
- `id` — the requested id (even when no such product exists)
- `name`, `price_cents` — the product's, or `NULL` when it does not exist
- `found` — whether it exists

A duplicate id yields a row for **each** occurrence. A `NULL` element yields a
row with `found = false`. An empty array yields no rows.

Inside a `language sql` function, qualify column names (`p.id`), because the
`returns table` column names are also in scope.
