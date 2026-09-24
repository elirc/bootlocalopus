An index is a sorted copy of some columns. It helps when the query's
filter and ordering match the index's leading columns — and costs you on every
write. Three rules cover most of it:

- **Composite order matters.** An index on `(a, b)` serves `where a = ?` and
  `where a = ? order by b`, but not `where b = ?`.
- **Partial indexes** skip rows you never query, which is most of them when you
  only ever look at one status.
- **Expression indexes** are needed when you filter on a function of a column.

## Task

The application runs exactly these queries:

```sql
-- A: a customer's orders, newest first
select * from orders where customer_id = $1 order by placed_at desc;

-- B: the pending queue, oldest first (pending is ~1% of rows)
select * from orders where status = 'pending' order by placed_at;

-- C: look up a customer by email regardless of case
select * from customers where lower(email) = lower($1);
```

Create exactly three indexes, named and shaped to serve them:

1. `orders_customer_placed_idx` — composite, on `orders`, supporting A
   including its ordering
2. `orders_pending_idx` — a **partial** index on `orders` for B
3. `customers_email_lower_idx` — a **unique** expression index on `customers`
   for C