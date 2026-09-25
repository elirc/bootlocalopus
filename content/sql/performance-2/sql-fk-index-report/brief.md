Deleting one customer took four minutes and locked the `orders` table
while it did. Postgres checks every foreign key that points at the row you
delete — "does any `invoices` row still reference customer 42?" — and
without an index on `invoices.customer_id` each check is a full scan. The
same missing index makes every "invoices for this customer" join slow.
Postgres indexes the **referenced** side (it must be unique) but never the
**referencing** side. That one is on you, and it is easy to miss in review.

So write the check once, as a report the team can run in CI.

A foreign key is **covered** when some index on the referencing table can
search by all of its columns: the key's columns are the index's **leading
key columns**, in any order. Specifically:

- an index on `(order_id, product_id)` covers a key on `order_id`, and on
  `(order_id, product_id)`, but not on `product_id` (second position);
- an index on `(user_id, tenant_id, role)` covers a key on `(tenant_id,
  user_id)`;
- a **partial** index does not count (it leaves rows out), nor does a column
  in an **`INCLUDE (…)`** list (stored, not searchable), nor an expression.

The catalog has what you need. `pg_constraint` (`contype = 'f'`) has the
key's columns in `conkey`, an `int2[]` of attribute numbers. `pg_index` has
`indkey`, an `int2vector` of attribute numbers (0 for an expression):
`indkey::int2[]` makes it an array — **indexed from 0**, so its first `n`
entries are `(indkey::int2[])[0:n-1]`. `indnkeyatts` is how many of them are
key columns (the rest are `INCLUDE`), and `indpred` is non-null for a
partial index. `pg_attribute` maps `(attrelid, attnum)` to `attname`.

The fixture is a small shop schema with a dozen foreign keys, some covered
and some not, including two multi-column keys.

## Task

1. Create a view `unindexed_foreign_keys` with exactly the columns
   `table_name`, `constraint_name` and `columns` (all `text`): one row per
   foreign key on a table in the `public` schema that is **not** covered.
   `columns` lists the key's columns in the key's own order, joined by `', '`
   (e.g. `'tenant_id, user_id'`).
2. End with `select * from unindexed_foreign_keys order by table_name,
   constraint_name;`.

## How it is graded

The grader compares the view with the eight uncovered keys in the fixture,
and your last statement with the same list. Then, inside a transaction it
rolls back, it changes the schema — a new table with an unindexed key, an
index that starts with an expression, a two-column key whose index has the
columns in the other order — and expects the view to follow.
