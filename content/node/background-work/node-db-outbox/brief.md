When an order is placed, the warehouse service must hear about it. The first
version does this:

```js
await conn.query('insert into orders …');
await broker.publish('order.placed', order);
```

That is a **dual write**, and it fails in both directions. The insert
succeeds and the process dies (or the broker is down) before the publish: the
order exists and the warehouse never ships it. Swap the two lines and the
warehouse ships an order whose insert then failed. Wrapping both in a database
transaction does not help — the broker is not part of your transaction.

The **transactional outbox** removes the dual write. The request writes the
order **and** an `outbox` row describing the event in **one database
transaction** — both or neither. A separate relay later reads unpublished
outbox rows, publishes them, and marks them published. If the relay crashes
after publishing but before marking, the event is published again on the next
run: delivery is **at-least-once**, so consumers dedupe by event id. That is a
trade you can live with; a lost order is not.

The fixture: `orders(id serial, customer text, total_cents int check (> 0), …)`
and `outbox(id serial, topic text, payload jsonb, created_at, published_at
timestamptz null, attempts int default 0, last_error text)`.

## Task

### 1. `placeOrder(conn, { customer, totalCents })`

In **one transaction** (`begin` … `commit`, and on any error `rollback` then
rethrow the original error):

- insert the order, getting its id;
- insert an outbox row with `topic` `'order.placed'` and `payload`
  `{ "orderId": <id>, "customer": …, "totalCents": … }` (pass
  `JSON.stringify(payload)` as a parameter cast with `$n::jsonb`).

Resolve to `{ orderId }`. `placeOrder` publishes nothing: there is no broker
anywhere near it. Every value goes in the parameter array.

### 2. `relayOutbox(conn, publish, { batchSize = 10 } = {})`

- Select up to `batchSize` rows with `published_at is null`, **oldest first**
  (`order by id`).
- For each row, **in order**: `await publish({ id, topic, payload })`
  (`payload` as the parsed object). When it resolves, mark **that row**
  published at once (`published_at = now()`), before publishing the next.
- When `publish` rejects: record the failure on that row (`attempts + 1`,
  `last_error` = the error's `message`) and **stop the batch**. Later rows
  wait for the next run, so consumers never see order 8's events before
  order 7's.
- Do not wrap the loop in a transaction: a failure must not roll back the
  marks of events that really were published.

Resolve to `{ published, failedId }`: how many rows were published in this
call, and the id of the row whose publish failed (`null` if none did).

## How it is graded

A spy wraps `conn` and checks that both of `placeOrder`'s inserts sit between
one `BEGIN` and one `COMMIT`, that no value appears in SQL text, and that a
failure — the order's `CHECK` constraint, or an injected error on the outbox
insert — leaves **neither** row behind and the connection outside any
transaction. The relay is run against a `publish` that fails on a chosen
event.
