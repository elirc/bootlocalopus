Page 1 of a category loads in 5 ms; page 151 takes 300. The query is the
same, with `offset 3000 limit 20`, and `OFFSET` does not skip anything: the
database produces the first 3,020 rows and throws 3,000 away. Here each of
those rows is a full product with a few hundred bytes of description,
fetched from the table only to be discarded.

Keyset pagination (`where (created_at, id) < (…)`) avoids the skip entirely,
and you should use it when you can. But "jump to page 151" and SEO-indexed
page numbers are real requirements, and for those there is the **deferred
join**:

1. find the 20 **ids** of the page with a query that only touches columns in
   an index — so skipping 3,000 entries happens inside the index, as an
   **Index Only Scan**, and never visits the table;
2. join those 20 ids back to the table for the wide columns;
3. sort the 20 again — a join does not promise to keep the inner order.

The fixture is `products(id, category_id, name, description, price_cents,
created_at)` with 20,000 rows, 4,000 in category 3, and the listing's index
`products_category_created_idx` on `(category_id, created_at desc, id
desc)`. Some products share a `created_at`, which is why `id` is part of
the order.

## Task

Replace the view `category_page`: page 151 of category 3 — newest first
(`created_at desc, id desc`), skipping 3,000 products and returning 20 —
with the columns `id, name, price_cents, created_at, description`. Same
rows, same order as the starter; but the 3,000 skipped rows must be skipped
in the index, and only the 20 shown may be read from the table.

Use the indexes that exist. (An index that `INCLUDE`s the description would
also avoid the table, at the price of copying the widest column into the
index. That is not the fix here.)

## How it is graded

The grader compares your view's rows with the starter's query. It checks
the index list is unchanged, then runs `explain (analyze, format json)
select * from category_page` with `enable_seqscan` off and expects an
`Index Only Scan` on `products_category_created_idx`, and at most 20 rows
(actual rows × loops) read from `products` by every other node.

The sandbox cannot run `VACUUM`, which is what marks table pages
all-visible and makes index-only scans cheap. So before planning, the
grader tells the planner every page is all-visible, as it would be on a
vacuumed production table. The actual run still shows `Heap Fetches`; in
production, autovacuum takes care of those.
