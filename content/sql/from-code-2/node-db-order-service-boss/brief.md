The checkout prototype places orders with a query per line and no
transaction. A 30-line wholesale order takes 90 round trips; a failure on
line 17 leaves an order with 16 lines and 16 products' stock gone; a
double-click creates two orders; an unknown customer id becomes a 500.

Rebuild it with the tools from this chapter: one transaction per
operation, statements whose count does not grow with the order,
constraints as the source of truth with their errors translated, rows
mapped to objects in one place, and idempotency.

The fixture: `customers` 1 (ada) and 2 (bob); `products(id, sku,
name, price_cents, stock)` — `P01`…`P30`, price `100 × n` cents, stock 10
(`P03` has only 2); `orders(id, customer_id, status 'placed'|'cancelled',
total_cents, idempotency_key unique, created_at)` with the foreign key
`orders_customer_id_fkey`; `order_lines(order_id, line_no, product_id,
qty, unit_price_cents)`. The error classes are in the starter.

An **order**, as every function returns it, is exactly:

```js
{ id, customerId, status, totalCents,
  lines: [{ lineNo, sku, qty, unitPriceCents }, …] }   // by lineNo; lineNo 1, 2, … in input order
```

## Task

1. **`placeOrder(conn, { customerId, lines, idempotencyKey })`** → the order.
   - Throw a `RangeError` before any query unless `customerId` is a positive
     safe integer, `idempotencyKey` a non-empty string, and `lines` an array
     of 1–50 `{ sku, qty }` with non-empty, **distinct** skus and positive
     safe-integer quantities.
   - One transaction. If an order with this `idempotencyKey` exists,
     resolve to it (as stored) and change nothing.
   - Lock the products (`… for update`, in id order) and read their price
     and stock. Unknown skus → `UnknownProductError` with **all** of them,
     sorted. Any line wanting more than the stock → `OutOfStockError` with
     **all** such skus, sorted. Either way, nothing changes.
   - Insert the order (`total_cents` = Σ qty × price). Do **not** look the
     customer up first: when the foreign key rejects it (`23503` on
     `orders_customer_id_fkey`), throw `new NotFoundError('customer', {
     cause: err })`.
   - Insert the lines and decrement the stock. **The number of statements
     must not depend on the number of lines** — `unnest` arrays, as in the
     batch-insert lesson.
2. **`getOrder(conn, id)`** → the order, or `null`.
3. **`cancelOrder(conn, id)`** → the order (now `'cancelled'`), or `null` if
   there is none. In one transaction, put each line's quantity back in
   stock — **once**: cancelling a cancelled order changes nothing.

Every value goes in the parameter array. On any failure inside a
transaction, roll back and rethrow the error.

## How it is graded

Through a connection with only `query`. The grader checks the returned
shapes with `toStrictEqual`; one `BEGIN`/`COMMIT` around every write; the
statement count for a 1-line and a 30-line order (they must be equal);
replays; unknown and short skus; the unknown customer (`err.cause.code`
`'23503'`); injected failures while writing lines and while restocking;
double cancellation; and a day of mixed orders, after each of which stock
plus the units in placed orders must equal the starting stock.
